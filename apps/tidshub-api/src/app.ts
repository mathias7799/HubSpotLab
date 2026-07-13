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
          const entry = await hubspot.createEntry(
            schema.fullyQualifiedName,
            schema.primaryDisplayProperty,
            stringProperties(body.properties),
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

function positiveInteger(value: string | null, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RequestError(`${name} must be a positive integer.`);
  }
  return parsed;
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
