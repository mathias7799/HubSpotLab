import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../src/index.js";

const baseEnv = {
  HUBSPOT_CLIENT_ID: "client-id",
  HUBSPOT_CLIENT_SECRET: "client-secret",
  PUBLIC_URL: "https://app.example.test",
  TOKEN_ENCRYPTION_KEY: "a-production-key-with-at-least-32-characters",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
};

function load(env: Record<string, string | undefined> = baseEnv) {
  return loadRuntimeConfig({
    appName: "Example",
    namespace: "example-app",
    requiredScopes: ["oauth", "crm.objects.deals.read"],
    optionalScopes: ["crm.objects.contacts.read"],
    env,
  });
}

describe("loadRuntimeConfig", () => {
  it("loads production config and separates optional scopes", () => {
    const config = load({
      ...baseEnv,
      HUBSPOT_SCOPES: "oauth crm.objects.deals.read crm.objects.companies.read",
    });

    expect(config.requiredScopes).toEqual(["oauth", "crm.objects.deals.read"]);
    expect(config.optionalScopes).toEqual(["crm.objects.companies.read"]);
    expect(config.publicUrl).toBe("https://app.example.test");
  });

  it("allows an explicit unsigned localhost setup", () => {
    const config = load({
      ...baseEnv,
      PUBLIC_URL: "http://127.0.0.1:8788/",
      TOKEN_ENCRYPTION_KEY: "local",
      ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    expect(config.publicUrl).toBe("http://127.0.0.1:8788");
    expect(config.allowUnsignedDevelopmentRequests).toBe(true);
  });

  it("rejects insecure or unsigned non-local deployments", () => {
    expect(() =>
      load({ ...baseEnv, PUBLIC_URL: "http://example.test" }),
    ).toThrow("must use HTTPS");
    expect(() =>
      load({
        ...baseEnv,
        ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
      }),
    ).toThrow("only with a localhost");
  });

  it("requires paired durable-storage variables", () => {
    expect(() =>
      load({ ...baseEnv, UPSTASH_REDIS_REST_TOKEN: undefined }),
    ).toThrow("must be configured together");
  });

  it("rejects missing required scopes", () => {
    expect(() => load({ ...baseEnv, HUBSPOT_SCOPES: "oauth" })).toThrow(
      "crm.objects.deals.read",
    );
  });

  it("requires oauth and a production-strength encryption secret", () => {
    expect(() =>
      loadRuntimeConfig({
        appName: "Example",
        namespace: "example-app",
        requiredScopes: ["crm.objects.deals.read"],
        env: baseEnv,
      }),
    ).toThrow("include oauth");
    expect(() => load({ ...baseEnv, TOKEN_ENCRYPTION_KEY: "short" })).toThrow(
      "at least 32 characters",
    );
  });
});
