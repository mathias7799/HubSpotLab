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
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const publicUrl = required(env, "PUBLIC_URL").replace(/\/$/, "");
  const upstashUrl = optional(env, "UPSTASH_REDIS_REST_URL");
  const upstashToken = optional(env, "UPSTASH_REDIS_REST_TOKEN");
  if (Boolean(upstashUrl) !== Boolean(upstashToken)) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together.",
    );
  }

  return {
    clientId: required(env, "HUBSPOT_CLIENT_ID"),
    clientSecret: required(env, "HUBSPOT_CLIENT_SECRET"),
    publicUrl,
    scopes: (env.HUBSPOT_SCOPES ?? defaultScopes.join(" "))
      .split(/[\s,]+/)
      .filter(Boolean),
    encryptionKey: required(env, "TOKEN_ENCRYPTION_KEY"),
    ...(upstashUrl ? { upstashUrl } : {}),
    ...(upstashToken ? { upstashToken } : {}),
    port: parsePort(env.PORT),
    allowUnsignedDevelopmentRequests:
      env.ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS === "true",
  };
}

export const defaultScopes = [
  "oauth",
  "crm.schemas.custom.read",
  "crm.objects.custom.read",
  "crm.objects.custom.write",
  "crm.objects.contacts.read",
  "crm.objects.companies.read",
  "crm.objects.deals.read",
  "crm.objects.projects.read",
  "tickets",
  "crm.objects.owners.read",
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
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}
