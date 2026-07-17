import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("__SPOTKIT_DISPLAY_NAME_JSON__ API", () => {
  it("reports health", async () => {
    const response = await createApp({
      HUBSPOT_CLIENT_ID: "local",
      HUBSPOT_CLIENT_SECRET: "local",
      PUBLIC_URL: "http://localhost:8788",
      TOKEN_ENCRYPTION_KEY: "local",
      ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
    })(new Request("http://localhost:8788/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("exposes the OAuth install route", async () => {
    const response = await createApp({
      HUBSPOT_CLIENT_ID: "client-id",
      HUBSPOT_CLIENT_SECRET: "client-secret",
      PUBLIC_URL: "http://localhost:8788",
      TOKEN_ENCRYPTION_KEY: "local",
      ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
    })(new Request("http://localhost:8788/oauth/install"));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://app.hubspot.com");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8788/oauth/callback",
    );
  });
});
