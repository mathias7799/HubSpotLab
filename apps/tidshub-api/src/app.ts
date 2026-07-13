import type { AppConfig } from "./config.js";
import { HubSpotApiError, HubSpotClient } from "./hubspot.js";
import { OAuthError, OAuthService } from "./oauth.js";
import { assertHubSpotRequest, SecurityError } from "./security.js";
import type { TokenStore } from "./token-store.js";

export interface AppDependencies {
  config: AppConfig;
  store: TokenStore;
  fetcher?: typeof fetch;
}

export function createApp(dependencies: AppDependencies) {
  const { config, store, fetcher = fetch } = dependencies;
  const oauth = new OAuthService(config, store, fetcher);

  return async function app(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "tidshub-api" });
      }
      if (request.method === "GET" && url.pathname === "/oauth/install") {
        const location = oauth.installUrl(
          url.searchParams.get("returnTo") ?? undefined,
        );
        const state = new URL(location).searchParams.get("state");
        const secureCookie = config.publicUrl.startsWith("https://")
          ? "; Secure"
          : "";
        return new Response(null, {
          status: 302,
          headers: {
            Location: location,
            "Set-Cookie": `tidshub_oauth_state=${state}; HttpOnly${secureCookie}; SameSite=Lax; Path=/oauth; Max-Age=600`,
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/oauth/callback") {
        const code = requiredQuery(url, "code");
        const state = requiredQuery(url, "state");
        if (readCookie(request, "tidshub_oauth_state") !== state) {
          throw new OAuthError(400, "OAuth state cookie does not match.");
        }
        const installation = await oauth.complete(code, state);
        return Response.redirect(
          new URL(installation.returnTo, config.publicUrl).toString(),
          302,
        );
      }
      if (request.method === "GET" && url.pathname === "/installed") {
        return new Response(
          "<!doctype html><meta charset=utf-8><title>TidsHub</title><h1>TidsHub er installeret</h1><p>Du kan nu vende tilbage til HubSpot.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      if (url.pathname.startsWith("/api/")) {
        const rawBody = request.method === "GET" ? "" : await request.text();
        await assertHubSpotRequest(request, config, rawBody);
        const portalId = positiveInteger(
          url.searchParams.get("portalId") ??
            request.headers.get("x-hubspot-portal-id"),
          "portalId",
        );
        const accessToken = await oauth.accessToken(portalId);
        const hubspot = new HubSpotClient(accessToken, fetcher);

        if (request.method === "POST" && url.pathname === "/api/provision") {
          return json(await hubspot.ensureSchema());
        }
        if (request.method === "GET" && url.pathname === "/api/users") {
          return json({ results: await hubspot.listUsers() });
        }
        if (request.method === "GET" && url.pathname === "/api/crm/search") {
          return json({
            results: await hubspot.searchCrmRecords(
              crmObjectType(requiredQuery(url, "objectType")),
              requiredQuery(url, "q"),
            ),
          });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/api/approval-settings"
        ) {
          const schema = await hubspot.ensureSchema();
          return json({
            settings: await hubspot.getApprovalSettings(
              schema.fullyQualifiedName,
              requiredQuery(url, "ownerId"),
            ),
          });
        }
        if (
          request.method === "PUT" &&
          url.pathname === "/api/approval-settings"
        ) {
          const body = parseObject(rawBody);
          const schema = await hubspot.ensureSchema();
          return json({
            settings: await hubspot.saveApprovalSettings({
              objectType: schema.fullyQualifiedName,
              primaryDisplayProperty: schema.primaryDisplayProperty,
              ownerId: requiredBodyString(body, "ownerId"),
              ownerEmail: requiredBodyString(body, "ownerEmail"),
              approverId: requiredBodyString(body, "approverId"),
              approverEmail: requiredBodyString(body, "approverEmail"),
            }),
          });
        }
        if (request.method === "GET" && url.pathname === "/api/week") {
          const schema = await hubspot.ensureSchema();
          return json({
            week: await hubspot.getWeekApproval(
              schema.fullyQualifiedName,
              requiredQuery(url, "ownerId"),
              requiredQuery(url, "weekKey"),
            ),
          });
        }
        if (request.method === "POST" && url.pathname === "/api/week/submit") {
          const body = parseObject(rawBody);
          const schema = await hubspot.ensureSchema();
          return json({
            week: await hubspot.submitWeek({
              objectType: schema.fullyQualifiedName,
              primaryDisplayProperty: schema.primaryDisplayProperty,
              ownerId: requiredBodyString(body, "ownerId"),
              ownerEmail: requiredBodyString(body, "ownerEmail"),
              weekKey: requiredBodyString(body, "weekKey"),
              totalMinutes: nonNegativeInteger(
                body.totalMinutes,
                "totalMinutes",
              ),
            }),
          });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/api/approvals/pending"
        ) {
          const schema = await hubspot.ensureSchema();
          return json({
            results: await hubspot.listPendingApprovals(
              schema.fullyQualifiedName,
              requiredQuery(url, "approverId"),
            ),
          });
        }
        if (request.method === "POST" && url.pathname === "/api/week/approve") {
          const body = parseObject(rawBody);
          const schema = await hubspot.ensureSchema();
          return json({
            week: await hubspot.approveWeek({
              objectType: schema.fullyQualifiedName,
              weekId: requiredBodyString(body, "weekId"),
              approverId: requiredBodyString(body, "approverId"),
              approverEmail: requiredBodyString(body, "approverEmail"),
            }),
          });
        }
        if (request.method === "GET" && url.pathname === "/api/entries") {
          const schema = await hubspot.ensureSchema();
          const results = await hubspot.searchEntries({
            objectType: schema.fullyQualifiedName,
            from: isoDate(requiredQuery(url, "from"), "from"),
            to: isoDate(requiredQuery(url, "to"), "to"),
            ...(url.searchParams.get("ownerId")
              ? { ownerId: url.searchParams.get("ownerId") as string }
              : {}),
          });
          return json({ results, schema });
        }
        if (request.method === "POST" && url.pathname === "/api/entries") {
          const body = parseObject(rawBody);
          const schema = await hubspot.ensureSchema();
          const properties = stringProperties(body.properties);
          const existingWeek = await hubspot.getWeekApproval(
            schema.fullyQualifiedName,
            requiredRecordProperty(properties, "hubspot_user_id"),
            requiredRecordProperty(properties, "week_key"),
          );
          if (
            existingWeek &&
            ["submitted", "approved"].includes(existingWeek.status)
          ) {
            throw new RequestError(
              "Ugen er indsendt og kan ikke modtage flere registreringer.",
            );
          }
          const entry = await hubspot.createEntry(
            schema.fullyQualifiedName,
            schema.primaryDisplayProperty,
            properties,
          );
          const association = optionalAssociation(body.association);
          if (association) {
            await hubspot.associate(
              schema.fullyQualifiedName,
              entry.id,
              association.objectTypeId,
              association.objectId,
            );
          }
          return json(entry, 201);
        }
        const entryRoute = url.pathname.match(/^\/api\/entries\/([^/]+)$/);
        if (entryRoute && request.method === "PATCH") {
          const body = parseObject(rawBody);
          const schema = await hubspot.ensureSchema();
          const durationMinutes = positiveInteger(
            body.durationMinutes,
            "durationMinutes",
          );
          return json(
            await hubspot.updateEntry({
              objectType: schema.fullyQualifiedName,
              entryId: decodeURIComponent(entryRoute[1] as string),
              ownerId: requiredBodyString(body, "ownerId"),
              properties: {
                duration_minutes: String(durationMinutes),
                category: timeCategory(body.category),
                description: optionalBodyString(body.description),
                billable: booleanValue(body.billable, "billable"),
              },
            }),
          );
        }
        if (entryRoute && request.method === "DELETE") {
          const schema = await hubspot.ensureSchema();
          await hubspot.deleteEntry({
            objectType: schema.fullyQualifiedName,
            entryId: decodeURIComponent(entryRoute[1] as string),
            ownerId: requiredQuery(url, "ownerId"),
          });
          return json({ deleted: true });
        }
      }
      return json({ error: "Not found" }, 404);
    } catch (cause) {
      if (cause instanceof SecurityError)
        return json({ error: cause.message }, 401);
      if (cause instanceof OAuthError || cause instanceof HubSpotApiError) {
        return json({ error: cause.message }, cause.status);
      }
      if (cause instanceof RequestError)
        return json({ error: cause.message }, 400);
      console.error(cause);
      return json({ error: "Internal server error" }, 500);
    }
  };
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "https://app.hubspot.com",
    },
  });
}

function requiredQuery(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value) throw new RequestError(`Missing query parameter ${name}.`);
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RequestError(`${name} must be a positive integer.`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RequestError(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function optionalBodyString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new RequestError("description must be a string.");
  }
  return value.trim();
}

function booleanValue(value: unknown, name: string): string {
  if (typeof value !== "boolean") {
    throw new RequestError(`${name} must be a boolean.`);
  }
  return String(value);
}

function timeCategory(value: unknown): string {
  if (
    typeof value !== "string" ||
    !["project", "internal", "meeting", "break", "absence"].includes(value)
  ) {
    throw new RequestError("Unsupported time category.");
  }
  return value;
}

function crmObjectType(
  value: string,
): "contacts" | "companies" | "deals" | "tickets" {
  if (!["contacts", "companies", "deals", "tickets"].includes(value)) {
    throw new RequestError("Unsupported CRM object type.");
  }
  return value as "contacts" | "companies" | "deals" | "tickets";
}

function isoDate(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestError(`${name} must use YYYY-MM-DD.`);
  }
  return value;
}

function parseObject(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new RequestError("Request body must be a JSON object.");
  }
}

function requiredBodyString(
  body: Record<string, unknown>,
  name: string,
): string {
  const value = body[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredRecordProperty(
  properties: Record<string, string>,
  name: string,
): string {
  const value = properties[name]?.trim();
  if (!value) throw new RequestError(`Missing property ${name}.`);
  return value;
}

function stringProperties(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RequestError("properties must be an object.");
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (!["string", "number", "boolean"].includes(typeof item)) {
        throw new RequestError(`Property ${key} must be a scalar value.`);
      }
      return [key, String(item)];
    }),
  );
}

function optionalAssociation(
  value: unknown,
): { objectTypeId: string; objectId: string } | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("association must be an object.");
  }
  const association = value as Record<string, unknown>;
  if (
    !["string", "number"].includes(typeof association.objectTypeId) ||
    !["string", "number"].includes(typeof association.objectId)
  ) {
    throw new RequestError("association requires objectTypeId and objectId.");
  }
  return {
    objectTypeId: String(association.objectTypeId),
    objectId: String(association.objectId),
  };
}

function readCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [cookieName, ...value] = part.trim().split("=");
    if (cookieName === name) return value.join("=");
  }
  return null;
}

class RequestError extends Error {}
