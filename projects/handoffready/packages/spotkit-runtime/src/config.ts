export interface RuntimeConfig {
  appName: string;
  namespace: string;
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  requiredScopes: string[];
  optionalScopes: string[];
  encryptionKey: string;
  upstashUrl?: string;
  upstashToken?: string;
  port: number;
  allowUnsignedDevelopmentRequests: boolean;
  allowEphemeralTunnelDevelopment: boolean;
}

export interface LoadRuntimeConfigOptions {
  appName: string;
  namespace: string;
  requiredScopes: readonly string[];
  optionalScopes?: readonly string[];
  defaultPort?: number;
  env?: Record<string, string | undefined>;
}

export function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions,
): RuntimeConfig {
  validateIdentity(options.appName, options.namespace);
  const env = options.env ?? process.env;
  const allowUnsigned = env.ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS === "true";
  const allowEphemeralTunnelDevelopment =
    env.ALLOW_EPHEMERAL_TUNNEL_DEVELOPMENT === "true";
  const publicUrl = normalizePublicUrl(required(env, "PUBLIC_URL"));
  const parsedPublicUrl = new URL(publicUrl);
  const local = isLocalHostname(parsedPublicUrl.hostname);
  if (allowUnsigned && !local) {
    throw new Error(
      "Unsigned development requests are allowed only with a localhost PUBLIC_URL.",
    );
  }
  if (
    allowEphemeralTunnelDevelopment &&
    parsedPublicUrl.protocol !== "https:"
  ) {
    throw new Error(
      "Ephemeral tunnel development requires an HTTPS PUBLIC_URL.",
    );
  }
  if (!allowUnsigned && parsedPublicUrl.protocol !== "https:") {
    throw new Error("PUBLIC_URL must use HTTPS outside local development.");
  }

  const upstashUrl = optional(env, "UPSTASH_REDIS_REST_URL");
  const upstashToken = optional(env, "UPSTASH_REDIS_REST_TOKEN");
  if (Boolean(upstashUrl) !== Boolean(upstashToken)) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together.",
    );
  }

  const requiredScopes = unique(options.requiredScopes);
  if (!requiredScopes.includes("oauth")) {
    throw new Error("requiredScopes must include oauth.");
  }
  const defaults = unique([
    ...requiredScopes,
    ...(options.optionalScopes ?? []),
  ]);
  const configured = splitScopes(env.HUBSPOT_SCOPES) ?? defaults;
  const missing = requiredScopes.filter((scope) => !configured.includes(scope));
  if (missing.length) {
    throw new Error(
      `HUBSPOT_SCOPES is missing required scopes: ${missing.join(", ")}.`,
    );
  }

  const encryptionKey = required(env, "TOKEN_ENCRYPTION_KEY");
  if (!allowUnsigned && encryptionKey.length < 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must contain at least 32 characters in production.",
    );
  }

  return {
    appName: options.appName.trim(),
    namespace: options.namespace,
    clientId: required(env, "HUBSPOT_CLIENT_ID"),
    clientSecret: required(env, "HUBSPOT_CLIENT_SECRET"),
    publicUrl,
    requiredScopes,
    optionalScopes: configured.filter(
      (scope) => !requiredScopes.includes(scope),
    ),
    encryptionKey,
    ...(upstashUrl ? { upstashUrl } : {}),
    ...(upstashToken ? { upstashToken } : {}),
    port: parsePort(env.PORT, options.defaultPort ?? 8788),
    allowUnsignedDevelopmentRequests: allowUnsigned,
    allowEphemeralTunnelDevelopment,
  };
}

export function isLocalHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function validateIdentity(appName: string, namespace: string): void {
  if (!appName.trim()) throw new Error("appName must not be empty.");
  if (!/^[a-z][a-z0-9-]*$/.test(namespace)) {
    throw new Error("namespace must be lowercase kebab-case.");
  }
}

function normalizePublicUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PUBLIC_URL must be a valid absolute URL.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("PUBLIC_URL must be an origin without a path or query.");
  }
  return parsed.origin;
}

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

function splitScopes(value: string | undefined): string[] | undefined {
  const scopes = value?.split(/[\s,]+/).filter(Boolean);
  return scopes?.length ? unique(scopes) : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parsePort(value: string | undefined, fallback: number): number {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}
