import { describe, expect, it, vi } from "vitest";

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
    const url = new URL(service.installUrl("//attacker.example/phish"));

    expect(url.origin).toBe("https://app.hubspot.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://tidshub.example.com/oauth/callback",
    );
    expect(url.searchParams.get("state")).toMatch(/^[^.]+\.[^.]+$/);
    const encoded = url.searchParams.get("state")!.split(".")[0]!;
    expect(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    ).toMatchObject({ returnTo: "/installed" });
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

  it("coalesces concurrent token refreshes per portal", async () => {
    const store = new MemoryTokenStore();
    await store.put({
      portalId: 1234,
      accessToken: "expired",
      refreshToken: "refresh",
      expiresAt: Date.now() - 1,
      installedAt: Date.now() - 60_000,
    });
    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 1800,
      }),
    ) as typeof fetch;
    const service = new OAuthService(config, store, fetcher);

    await expect(
      Promise.all([service.accessToken(1234), service.accessToken(1234)]),
    ).resolves.toEqual(["new-access", "new-access"]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
