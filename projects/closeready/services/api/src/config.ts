export interface AppConfig {
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  scopes: string[];
  encryptionKey: string;
  upstashUrl?: string;
  upstashToken?: string;
  port: number;
  allowUnsignedDevelopmentRequests: boolean;
  ruleStorage: "auto" | "hubspot" | "external";
  authorizationPolicy: AuthorizationPolicy;
}

export type AuthorizationPolicy = Record<
  string,
  { administrators: string[]; transitioners: string[] }
>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const upstashUrl = optional(env, "UPSTASH_REDIS_REST_URL");
  const upstashToken = optional(env, "UPSTASH_REDIS_REST_TOKEN");
  if (Boolean(upstashUrl) !== Boolean(upstashToken)) {
    throw new Error("Both Upstash REST variables must be configured together.");
  }
  return {
    clientId: required(env, "HUBSPOT_CLIENT_ID"),
    clientSecret: required(env, "HUBSPOT_CLIENT_SECRET"),
    publicUrl: required(env, "PUBLIC_URL").replace(/\/$/, ""),
    scopes: (env.HUBSPOT_SCOPES ?? defaultScopes.join(" "))
      .split(/[\s,]+/)
      .filter(Boolean),
    encryptionKey: required(env, "TOKEN_ENCRYPTION_KEY"),
    ...(upstashUrl ? { upstashUrl } : {}),
    ...(upstashToken ? { upstashToken } : {}),
    port: port(env.PORT),
    allowUnsignedDevelopmentRequests:
      env.ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS === "true",
    ruleStorage: ruleStorage(env.RULE_STORAGE),
    authorizationPolicy: authorizationPolicy(
      env.CLOSEREADY_AUTHORIZATION_POLICY,
    ),
  };
}

function authorizationPolicy(value: string | undefined): AuthorizationPolicy {
  if (!value?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("CLOSEREADY_AUTHORIZATION_POLICY must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("CLOSEREADY_AUTHORIZATION_POLICY must be a portal map.");
  }
  const result: AuthorizationPolicy = {};
  for (const [portalId, entry] of Object.entries(parsed)) {
    if (!/^\d+$/.test(portalId) || Number(portalId) <= 0) {
      throw new Error(
        "Authorization policy portal IDs must be positive integers.",
      );
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(
        `Authorization policy for portal ${portalId} must be an object.`,
      );
    }
    const record = entry as Record<string, unknown>;
    result[portalId] = {
      administrators: stringArray(record.administrators, "administrators"),
      transitioners: stringArray(record.transitioners, "transitioners"),
    };
  }
  return result;
}

function stringArray(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(
      `Authorization policy ${name} must be an array of user IDs.`,
    );
  }
  return [...new Set(value.map((item) => (item as string).trim()))];
}

function ruleStorage(value: string | undefined): AppConfig["ruleStorage"] {
  const normalized = value?.trim().toLowerCase() || "auto";
  if (!["auto", "hubspot", "external"].includes(normalized)) {
    throw new Error("RULE_STORAGE must be auto, hubspot, or external.");
  }
  return normalized as AppConfig["ruleStorage"];
}

export const defaultScopes = [
  "oauth",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.contacts.read",
  "crm.objects.companies.read",
] as const;

function required(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = optional(env, name);
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function optional(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  return env[name]?.trim() || undefined;
}

function port(value: string | undefined): number {
  const parsed = Number(value ?? 8788);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return parsed;
}
