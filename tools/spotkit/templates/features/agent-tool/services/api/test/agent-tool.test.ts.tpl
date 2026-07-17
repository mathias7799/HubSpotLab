import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const env = {
  HUBSPOT_CLIENT_ID: "local",
  HUBSPOT_CLIENT_SECRET: "local",
  PUBLIC_URL: "http://localhost:8788",
  TOKEN_ENCRYPTION_KEY: "local",
  ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
};

describe("HubSpot agent tool", () => {
  it("returns a bounded output and deduplicates callbacks", async () => {
    const app = createApp(env);
    const body = JSON.stringify({
      callbackId: "agent-callback-1",
      origin: { portalId: 123456 },
      inputFields: { instruction: "Summarize the current CRM context" },
    });
    const request = () =>
      new Request("http://localhost:8788/workflow-actions/agent-tool", {
        method: "POST",
        body,
      });
    await expect((await app(request())).json()).resolves.toEqual({
      outputFields: { result: "Accepted: Summarize the current CRM context" },
    });
    await expect((await app(request())).json()).resolves.toEqual({
      outputFields: { result: "Already processed" },
    });
  });
});
