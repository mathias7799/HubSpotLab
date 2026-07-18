import type { RuntimeConfig } from "../src/index.js";

export function runtimeConfig(
  overrides: {
    [Key in keyof RuntimeConfig]?: RuntimeConfig[Key] | undefined;
  } = {},
): RuntimeConfig {
  const config = {
    appName: "Example app",
    namespace: "example-app",
    clientId: "client-id",
    clientSecret: "client-secret",
    publicUrl: "https://example.test",
    requiredScopes: ["oauth", "crm.objects.deals.read"],
    optionalScopes: ["crm.objects.contacts.read"],
    encryptionKey: "a-production-key-with-at-least-32-characters",
    upstashUrl: "https://redis.example.test",
    upstashToken: "redis-token",
    port: 8788,
    allowUnsignedDevelopmentRequests: false,
    allowEphemeralTunnelDevelopment: false,
    ...overrides,
  } as RuntimeConfig;
  if (overrides.upstashUrl === undefined && "upstashUrl" in overrides) {
    delete config.upstashUrl;
  }
  if (overrides.upstashToken === undefined && "upstashToken" in overrides) {
    delete config.upstashToken;
  }
  return config;
}

export function fetcher(
  implementation: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
): typeof fetch {
  return implementation as typeof fetch;
}
