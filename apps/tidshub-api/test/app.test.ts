import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const config: AppConfig = {
  clientId: "client",
  clientSecret: "secret",
  publicUrl: "http://localhost:8787",
  scopes: [],
  encryptionKey: "encryption-key",
  port: 8787,
  allowUnsignedDevelopmentRequests: true,
};

describe("app", () => {
  it("reports health without requiring OAuth", async () => {
    const app = createApp({ config, store: new MemoryTokenStore() });
    const response = await app(new Request("http://localhost:8787/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "tidshub-api",
    });
  });

  it("rejects unknown routes", async () => {
    const app = createApp({ config, store: new MemoryTokenStore() });
    const response = await app(new Request("http://localhost:8787/nope"));

    expect(response.status).toBe(404);
  });

  it("sets a same-site state cookie before redirecting to HubSpot OAuth", async () => {
    const app = createApp({ config, store: new MemoryTokenStore() });
    const response = await app(
      new Request("http://localhost:8787/oauth/install"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "https://app.hubspot.com/oauth/authorize",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "tidshub_oauth_state=",
    );
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });
});
