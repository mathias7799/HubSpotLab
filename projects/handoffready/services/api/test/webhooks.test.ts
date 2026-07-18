import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const env = {
  HUBSPOT_CLIENT_ID: "local",
  HUBSPOT_CLIENT_SECRET: "local",
  PUBLIC_URL: "http://localhost:8788",
  TOKEN_ENCRYPTION_KEY: "local",
  ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
};

describe("HubSpot webhooks", () => {
  it("accepts valid batches and safely acknowledges duplicates", async () => {
    const app = createApp(env);
    const body = JSON.stringify([
      {
        eventId: 1001,
        subscriptionId: 2002,
        portalId: 123456,
        occurredAt: Date.now(),
        subscriptionType: "object.creation",
        objectId: 3003,
      },
    ]);
    const request = () =>
      new Request("http://localhost:8788/webhooks/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    expect((await app(request())).status).toBe(204);
    expect((await app(request())).status).toBe(204);
  });

  it("rejects malformed webhook batches", async () => {
    const response = await createApp(env)(
      new Request("http://localhost:8788/webhooks/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{}]),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects webhook batches without a JSON content type", async () => {
    const response = await createApp(env)(
      new Request("http://localhost:8788/webhooks/hubspot", {
        method: "POST",
        body: "[]",
      }),
    );
    expect(response.status).toBe(415);
  });
});
