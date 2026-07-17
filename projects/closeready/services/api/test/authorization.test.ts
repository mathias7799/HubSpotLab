import { describe, expect, it } from "vitest";

import {
  actorPermissions,
  loadConfig,
  requireRuleAdministrator,
  requireTransitionPermission,
} from "../src/index.js";

const baseEnv = {
  HUBSPOT_CLIENT_ID: "client",
  HUBSPOT_CLIENT_SECRET: "secret",
  PUBLIC_URL: "https://closeready.example.com",
  TOKEN_ENCRYPTION_KEY: "encryption-key",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
};

describe("CloseReady authorization policy", () => {
  it("grants portal-scoped rule and transition capabilities", () => {
    const config = loadConfig({
      ...baseEnv,
      CLOSEREADY_AUTHORIZATION_POLICY: JSON.stringify({
        123: { administrators: ["42"], transitioners: ["84"] },
      }),
    });

    const administrator = actorPermissions(
      request(123, "42", "admin@example.com"),
      123,
      config,
    );
    expect(administrator).toMatchObject({
      canManageRules: true,
      canTransition: true,
    });

    const transitioner = actorPermissions(
      request(123, "84", "seller@example.com"),
      123,
      config,
    );
    expect(transitioner).toMatchObject({
      canManageRules: false,
      canTransition: true,
    });
  });

  it("denies mutations by default for unconfigured production users", () => {
    const permissions = actorPermissions(
      request(123, "99", "user@example.com"),
      123,
      loadConfig(baseEnv),
    );

    expect(() => requireRuleAdministrator(permissions)).toThrowError(
      /not configured as a CloseReady rule administrator/,
    );
    expect(() => requireTransitionPermission(permissions)).toThrowError(
      /not configured to perform CloseReady stage transitions/,
    );
  });

  it("requires signed user identity outside localhost development", () => {
    expect(() =>
      actorPermissions(
        new Request("https://closeready.example.com/api/catalog?portalId=123"),
        123,
        loadConfig(baseEnv),
      ),
    ).toThrowError(/signed user identity metadata/);
  });

  it("rejects malformed authorization policy configuration", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        CLOSEREADY_AUTHORIZATION_POLICY: JSON.stringify({
          123: { administrators: "42" },
        }),
      }),
    ).toThrowError(/administrators must be an array/);
  });
});

function request(portalId: number, userId: string, userEmail: string): Request {
  const query = new URLSearchParams({
    portalId: String(portalId),
    userId,
    userEmail,
  });
  return new Request(`https://closeready.example.com/api/catalog?${query}`);
}
