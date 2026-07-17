import { describe, expect, it } from "vitest";

import {
  createOAuthRouter,
  HttpError,
  MemoryTokenStore,
  OAuthService,
} from "../src/index.js";
import { runtimeConfig } from "./helpers.js";

describe("OAuth router", () => {
  const config = runtimeConfig();
  const oauth = new OAuthService(config, new MemoryTokenStore());
  const app = createOAuthRouter(config, oauth, async () =>
    Response.json({ delegated: true }),
  );

  it("starts installation with a bound, secure state cookie", async () => {
    const response = await app(
      new Request("https://example.test/oauth/install?returnTo=/setup"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "https://app.hubspot.com/oauth/authorize",
    );
    expect(response.headers.get("set-cookie")).toMatch(
      /HttpOnly; Secure; SameSite=Lax; Path=\/oauth; Max-Age=600/,
    );
  });

  it("rejects callbacks without the matching browser cookie", async () => {
    const location = (
      await app(new Request("https://example.test/oauth/install"))
    ).headers.get("location")!;
    const state = new URL(location).searchParams.get("state")!;
    const response = await app(
      new Request(
        `https://example.test/oauth/callback?code=code&state=${encodeURIComponent(state)}`,
      ),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "OAuth state cookie does not match.",
    });
  });

  it("serves a locked-down installed page and delegates unknown routes", async () => {
    const installed = await app(new Request("https://example.test/installed"));
    expect(installed.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(installed.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await installed.text()).toContain("Example app is connected");

    const delegated = await app(new Request("https://example.test/health"));
    await expect(delegated.json()).resolves.toEqual({ delegated: true });
  });

  it("returns explicit domain errors without converting them to 500s", async () => {
    const errorApp = createOAuthRouter(config, oauth, async () => {
      throw new HttpError(422, "Configuration is invalid.");
    });
    const response = await errorApp(new Request("https://example.test/api"));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Configuration is invalid.",
    });
  });
});
