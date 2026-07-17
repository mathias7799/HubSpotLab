import { describe, expect, it, vi } from "vitest";

import {
  defaultScopes,
  createService,
  MemoryRuleStore,
  MemoryTokenStore,
  OAuthService,
  type AppConfig,
} from "../src/index.js";

describe("OAuthService", () => {
  it("sends custom-object grants as optional scopes", () => {
    const config = {
      clientId: "client",
      clientSecret: "secret",
      publicUrl: "https://closeready.example.com",
      scopes: [
        ...defaultScopes,
        "crm.schemas.custom.read",
        "crm.objects.custom.read",
        "crm.objects.custom.write",
      ],
    } as AppConfig;
    const service = new OAuthService(config, new MemoryTokenStore());

    const url = new URL(service.installUrl("//attacker.example/phish"));
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      ...defaultScopes,
    ]);
    expect(url.searchParams.get("optional_scope")?.split(" ")).toEqual([
      "crm.schemas.custom.read",
      "crm.objects.custom.read",
      "crm.objects.custom.write",
    ]);
    const encoded = url.searchParams.get("state")!.split(".")[0]!;
    expect(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    ).toMatchObject({ returnTo: "/installed" });
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
    const config = {
      clientId: "client",
      clientSecret: "secret",
      publicUrl: "https://closeready.example.com",
      scopes: [...defaultScopes],
    } as AppConfig;
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

  it("locks down the installed confirmation page", async () => {
    const config = {
      clientId: "client",
      clientSecret: "secret",
      publicUrl: "https://closeready.example.com",
      scopes: [...defaultScopes],
      ruleStorage: "external",
    } as AppConfig;
    const service = createService(
      config,
      new MemoryTokenStore(),
      new MemoryRuleStore(),
    );
    const response = await service(
      new Request("https://closeready.example.com/installed"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
