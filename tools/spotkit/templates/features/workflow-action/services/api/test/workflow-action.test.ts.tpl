import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const env = {
  HUBSPOT_CLIENT_ID: "local",
  HUBSPOT_CLIENT_SECRET: "local",
  PUBLIC_URL: "http://localhost:8788",
  TOKEN_ENCRYPTION_KEY: "local",
  ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
};

describe("HubSpot workflow action", () => {
  it("executes once and returns a stable duplicate result", async () => {
    const app = createApp(env);
    const body = JSON.stringify({
      callbackId: "callback-1",
      origin: { portalId: 123456 },
      object: { objectId: 987, objectType: "CONTACT" },
      inputFields: { message: "Hello", priority: "normal" },
    });
    const request = () =>
      new Request("http://localhost:8788/workflow-actions/example", {
        method: "POST",
        body,
      });
    await expect((await app(request())).json()).resolves.toEqual({
      outputFields: { status: "completed" },
    });
    await expect((await app(request())).json()).resolves.toEqual({
      outputFields: { status: "already_processed" },
    });
  });

  it("rejects incomplete workflow context", async () => {
    const response = await createApp(env)(
      new Request("http://localhost:8788/workflow-actions/example", {
        method: "POST",
        body: JSON.stringify({ callbackId: "missing-context" }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
