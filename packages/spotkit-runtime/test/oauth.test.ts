import { describe, expect, it, vi } from "vitest";

import {
  MemoryTokenStore,
  OAuthError,
  OAuthService,
  type Installation,
} from "../src/index.js";
import { fetcher, runtimeConfig } from "./helpers.js";

describe("OAuthService", () => {
  it("creates signed authorization URLs with required and optional scopes", () => {
    const oauth = new OAuthService(runtimeConfig(), new MemoryTokenStore());
    const url = new URL(oauth.installUrl("/\\attacker.example/path"));
    expect(url.origin + url.pathname).toBe(
      "https://app.hubspot.com/oauth/authorize",
    );
    expect(url.searchParams.get("scope")).toBe("oauth crm.objects.deals.read");
    expect(url.searchParams.get("optional_scope")).toBe(
      "crm.objects.contacts.read",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.test/oauth/callback",
    );
    const encodedState = url.searchParams.get("state")!.split(".")[0]!;
    expect(
      JSON.parse(Buffer.from(encodedState, "base64url").toString("utf8")),
    ).toMatchObject({ returnTo: "/installed" });
  });

  it("exchanges a valid state and persists the resolved portal", async () => {
    const store = new MemoryTokenStore();
    const mockFetch = vi.fn(
      fetcher(async (input) => {
        const url = String(input);
        if (url.endsWith("/oauth/v1/token")) {
          return Response.json({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 1800,
          });
        }
        return Response.json({ hub_id: 456 });
      }),
    );
    const oauth = new OAuthService(runtimeConfig(), store, mockFetch);
    const state = new URL(oauth.installUrl("/welcome")).searchParams.get(
      "state",
    )!;
    const result = await oauth.complete("authorization-code", state);

    expect(result).toMatchObject({ portalId: 456, returnTo: "/welcome" });
    expect(await store.get(456)).toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
    });
  });

  it("rejects tampered state", async () => {
    const oauth = new OAuthService(runtimeConfig(), new MemoryTokenStore());
    await expect(oauth.complete("code", "tampered.state")).rejects.toEqual(
      expect.objectContaining<Partial<OAuthError>>({ status: 400 }),
    );
  });

  it("coalesces concurrent refreshes for one portal", async () => {
    const store = new MemoryTokenStore();
    const expired: Installation = {
      portalId: 123,
      accessToken: "expired",
      refreshToken: "refresh",
      expiresAt: Date.now() - 1,
      installedAt: Date.now() - 60_000,
    };
    await store.put(expired);
    const mockFetch = vi.fn(
      fetcher(async () =>
        Response.json({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 1800,
        }),
      ),
    );
    const oauth = new OAuthService(runtimeConfig(), store, mockFetch);
    await expect(
      Promise.all([oauth.accessToken(123), oauth.accessToken(123)]),
    ).resolves.toEqual(["new-access", "new-access"]);
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
