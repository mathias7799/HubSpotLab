import { describe, expect, it } from "vitest";

import type { AppConfig } from "../src/config.js";
import { OAuthService } from "../src/oauth.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: AppConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  publicUrl: "https://tidshub.example.com",
  scopes: ["crm.objects.custom.read"],
  encryptionKey: "test-encryption-key",
  port: 8787,
  allowUnsignedDevelopmentRequests: true,
};

describe("OAuthService", () => {
  it("creates an install URL with a signed state and configured callback", () => {
    const service = new OAuthService(config, new MemoryTokenStore());
    const url = new URL(service.installUrl());

    expect(url.origin).toBe("https://app.hubspot.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://tidshub.example.com/oauth/callback",
    );
    expect(url.searchParams.get("state")).toMatch(/^[^.]+\.[^.]+$/);
  });

  it("exchanges a callback and stores the portal installation", async () => {
    const store = new MemoryTokenStore();
    const responses = [
      Response.json({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 1800,
      }),
      Response.json({ hub_id: 1234 }),
    ];
    const fetcher: typeof fetch = async () => responses.shift() as Response;
    const service = new OAuthService(config, store, fetcher);
    const state = new URL(service.installUrl()).searchParams.get(
      "state",
    ) as string;

    const result = await service.complete("code", state);

    expect(result.portalId).toBe(1234);
    expect(await store.get(1234)).toMatchObject({ refreshToken: "refresh" });
  });
});
