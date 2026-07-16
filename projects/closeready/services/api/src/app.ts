import type {
  FactValue,
  ReadinessRule,
  RuleSubject,
} from "@hubspotlab/closeready-core";

import { CloseReadyHubSpotClient, HubSpotApiError } from "./hubspot.js";
import type { RuleStore } from "./rule-store.js";

export interface AppDependencies {
  accessTokenForPortal: (portalId: number) => Promise<string>;
  verifyRequest: (request: Request, rawBody: string) => Promise<void>;
  fetcher?: typeof fetch;
  ruleStore: RuleStore;
  ruleStorage: "auto" | "hubspot" | "external";
}

/**
 * Web-standard handler shared by Node, Lambda, Azure Functions, and HubSpot
 * serverless adapters. Authentication and token persistence stay adapter-level.
 */
export function createApp(dependencies: AppDependencies) {
  const selectedStorage = new Map<number, "hubspot" | "external">();

  return async function app(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "closeready-api" });
      }
      if (!url.pathname.startsWith("/api/"))
        return json({ error: "Not found" }, 404);

      const rawBody = request.method === "GET" ? "" : await request.text();
      await dependencies.verifyRequest(request, rawBody);
      const portalId = positiveInteger(
        url.searchParams.get("portalId") ??
          request.headers.get("x-hubspot-portal-id"),
        "portalId",
      );
      const accessToken = await dependencies.accessTokenForPortal(portalId);
      const hubspot = new CloseReadyHubSpotClient(
        accessToken,
        dependencies.fetcher,
      );

      if (request.method === "POST" && url.pathname === "/api/provision") {
        const mode = await storageMode(portalId, hubspot);
        if (mode === "external") {
          return json({
            mode,
            durable: dependencies.ruleStore.durable,
            reason:
              "This portal does not include HubSpot custom objects, so CloseReady is using its encrypted portable store.",
          });
        }
        return json({ mode, ...(await hubspot.ensureRuleSchema()) });
      }
      if (request.method === "GET" && url.pathname === "/api/catalog") {
        return json(await hubspot.catalog());
      }
      const dealContextRoute = url.pathname.match(
        /^\/api\/deals\/([^/]+)\/context$/,
      );
      if (dealContextRoute && request.method === "GET") {
        return json(
          await hubspot.dealContext(
            decodeURIComponent(dealContextRoute[1] as string),
          ),
        );
      }
      if (request.method === "GET" && url.pathname === "/api/rules") {
        const mode = await storageMode(portalId, hubspot);
        return json({
          results:
            mode === "hubspot"
              ? await hubspot.listRules(
                  url.searchParams.get("pipelineId") ?? undefined,
                )
              : await dependencies.ruleStore.list(
                  portalId,
                  url.searchParams.get("pipelineId") ?? undefined,
                ),
        });
      }
      if (request.method === "POST" && url.pathname === "/api/rules") {
        const rule = parseRule(rawBody);
        const mode = await storageMode(portalId, hubspot);
        return json(
          mode === "hubspot"
            ? await hubspot.createRule(rule)
            : await dependencies.ruleStore.put(portalId, rule),
          201,
        );
      }

      const ruleRoute = url.pathname.match(/^\/api\/rules\/([^/]+)$/);
      if (ruleRoute && request.method === "PATCH") {
        const rule = parseRule(rawBody);
        const id = decodeURIComponent(ruleRoute[1] as string);
        const storedRule = { ...rule, id };
        const mode = await storageMode(portalId, hubspot);
        return json(
          mode === "hubspot"
            ? await hubspot.updateRule(storedRule)
            : await dependencies.ruleStore.put(portalId, storedRule),
        );
      }
      if (ruleRoute && request.method === "DELETE") {
        const id = decodeURIComponent(ruleRoute[1] as string);
        const mode = await storageMode(portalId, hubspot);
        if (mode === "hubspot") await hubspot.deleteRule(id);
        else await dependencies.ruleStore.delete(portalId, id);
        return json({ deleted: true });
      }

      const dealRoute = url.pathname.match(
        /^\/api\/deals\/([^/]+)\/(evaluate|transition)$/,
      );
      if (dealRoute && request.method === "POST") {
        const body = parseObject(rawBody);
        const dealId = decodeURIComponent(dealRoute[1] as string);
        const targetStageId = requiredString(
          body.targetStageId,
          "targetStageId",
        );
        const mode = await storageMode(portalId, hubspot);
        const rules =
          mode === "hubspot"
            ? await hubspot.listRules()
            : await dependencies.ruleStore.list(portalId);
        return json(
          dealRoute[2] === "transition"
            ? await hubspot.guardedTransition(dealId, targetStageId, rules)
            : await hubspot.evaluateDeal(dealId, targetStageId, rules),
        );
      }

      return json({ error: "Not found" }, 404);
    } catch (cause) {
      if (cause instanceof RequestError)
        return json({ error: cause.message }, 400);
      if (cause instanceof HubSpotApiError) {
        return json({ error: cause.message }, cause.status);
      }
      if (isStatusError(cause)) {
        return json({ error: cause.message }, cause.status);
      }
      if (cause instanceof Error && cause.name === "SecurityError") {
        return json({ error: cause.message }, 401);
      }
      console.error(cause);
      return json({ error: "Internal server error" }, 500);
    }
  };

  async function storageMode(
    portalId: number,
    hubspot: CloseReadyHubSpotClient,
  ): Promise<"hubspot" | "external"> {
    if (dependencies.ruleStorage === "external") return "external";
    const cached = selectedStorage.get(portalId);
    if (cached) return cached;
    try {
      await hubspot.ensureRuleSchema();
      selectedStorage.set(portalId, "hubspot");
      return "hubspot";
    } catch (cause) {
      if (
        dependencies.ruleStorage === "auto" &&
        cause instanceof HubSpotApiError &&
        (cause.status === 403 || cause.status === 409)
      ) {
        selectedStorage.set(portalId, "external");
        return "external";
      }
      throw cause;
    }
  }
}

function parseRule(rawBody: string): ReadinessRule {
  const body = parseObject(rawBody);
  const subject = parseSubject(parseObjectValue(body.subject, "subject"));
  const expectedValue = parseFactValue(body.expectedValue, "expectedValue");
  return {
    id: requiredString(body.id, "id"),
    pipelineId: requiredString(body.pipelineId, "pipelineId"),
    fromStageId: requiredString(body.fromStageId, "fromStageId"),
    targetStageId: requiredString(body.targetStageId, "targetStageId"),
    label: requiredString(body.label, "label"),
    subject,
    operator: requiredString(
      body.operator,
      "operator",
    ) as ReadinessRule["operator"],
    ...(expectedValue === undefined ? {} : { expectedValue }),
    severity: requiredString(
      body.severity,
      "severity",
    ) as ReadinessRule["severity"],
    enabled: requiredBoolean(body.enabled, "enabled"),
    nativeEnforcement: requiredBoolean(
      body.nativeEnforcement,
      "nativeEnforcement",
    ),
  };
}

function parseSubject(subject: Record<string, unknown>): RuleSubject {
  const kind = requiredString(subject.kind, "subject.kind");
  const associationLabel = optionalString(
    subject.associationLabel,
    "subject.associationLabel",
  );
  switch (kind) {
    case "deal_property":
      return {
        kind,
        propertyName: requiredString(
          subject.propertyName,
          "subject.propertyName",
        ),
      };
    case "associated_record_count":
      return {
        kind,
        objectType: objectType(subject.objectType),
        ...(associationLabel ? { associationLabel } : {}),
      };
    case "associated_record_property":
      return {
        kind,
        objectType: objectType(subject.objectType),
        propertyName: requiredString(
          subject.propertyName,
          "subject.propertyName",
        ),
        quantifier: quantifier(subject.quantifier),
        ...(associationLabel ? { associationLabel } : {}),
      };
    case "metric": {
      const metric = requiredString(subject.metric, "subject.metric");
      if (
        ![
          "line_item_count",
          "approved_quote_count",
          "open_task_count",
        ].includes(metric)
      ) {
        throw new RequestError("Unsupported metric.");
      }
      return {
        kind,
        metric: metric as Extract<RuleSubject, { kind: "metric" }>["metric"],
      };
    }
    default:
      throw new RequestError("Unsupported rule subject kind.");
  }
}

function parseFactValue(value: unknown, name: string): FactValue | undefined {
  if (value === undefined) return undefined;
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  ) {
    return value as FactValue;
  }
  if (
    Array.isArray(value) &&
    (value.every((item) => typeof item === "string") ||
      value.every((item) => typeof item === "number"))
  ) {
    return value as string[] | number[];
  }
  throw new RequestError(`${name} must be a scalar or a string/number array.`);
}

function parseObject(rawBody: string): Record<string, unknown> {
  try {
    return parseObjectValue(JSON.parse(rawBody) as unknown, "request body");
  } catch (cause) {
    if (cause instanceof RequestError) throw cause;
    throw new RequestError("Request body must be valid JSON.");
  }
}

function parseObjectValue(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RequestError(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean")
    throw new RequestError(`${name} must be boolean.`);
  return value;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string")
    throw new RequestError(`${name} must be a string.`);
  return value.trim() || undefined;
}

function objectType(value: unknown): "contacts" | "companies" {
  if (value !== "contacts" && value !== "companies") {
    throw new RequestError("subject.objectType must be contacts or companies.");
  }
  return value;
}

function quantifier(value: unknown): "any" | "all" {
  if (value !== "any" && value !== "all") {
    throw new RequestError("subject.quantifier must be any or all.");
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RequestError(`${name} must be a positive integer.`);
  }
  return parsed;
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

class RequestError extends Error {}

function isStatusError(cause: unknown): cause is Error & { status: number } {
  return (
    cause instanceof Error &&
    "status" in cause &&
    typeof cause.status === "number" &&
    cause.status >= 400 &&
    cause.status <= 599
  );
}
