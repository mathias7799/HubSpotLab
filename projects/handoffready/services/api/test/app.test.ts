import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("HandoffReady API", () => {
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

  it("protects portal installation status", async () => {
    const response = await createApp({
      HUBSPOT_CLIENT_ID: "local",
      HUBSPOT_CLIENT_SECRET: "local",
      PUBLIC_URL: "http://localhost:8788",
      TOKEN_ENCRYPTION_KEY: "local",
      ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
    })(new Request("http://localhost:8788/api/installation?portalId=123456"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "HandoffReady is not installed in this portal.",
    });
  });

  it("completes OAuth and persists portal settings", async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth/v1/token")) {
        return Response.json({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 1800,
        });
      }
      if (url.includes("/crm/v3/properties/deals")) {
        return Response.json({
          results: [
            { name: "dealname", label: "Deal name" },
            { name: "amount", label: "Amount" },
          ],
        });
      }
      if (url.includes("/crm/v3/pipelines/tickets")) {
        return Response.json({
          results: [
            {
              id: "support",
              label: "Customer service",
              stages: [{ id: "new", label: "New", displayOrder: 0 }],
            },
          ],
        });
      }
      return Response.json({ hub_id: 123456 });
    }) as typeof fetch;
    const app = createApp(
      {
        HUBSPOT_CLIENT_ID: "client-id",
        HUBSPOT_CLIENT_SECRET: "client-secret",
        PUBLIC_URL: "http://localhost:8788",
        TOKEN_ENCRYPTION_KEY: "local",
        ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
      },
      mockFetch,
    );
    const install = await app(
      new Request("http://localhost:8788/oauth/install"),
    );
    const location = new URL(install.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    const cookie = install.headers.get("set-cookie")!.split(";", 1)[0]!;
    const callback = await app(
      new Request(
        `http://localhost:8788/oauth/callback?code=code&state=${encodeURIComponent(state)}`,
        { headers: { cookie } },
      ),
    );
    expect(callback.status).toBe(302);

    const saved = await app(
      new Request("http://localhost:8788/api/settings?portalId=123456", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          requiredProperties: ["dealname", "amount"],
          requireCompany: true,
          requireContact: false,
          ticketPipelineId: "support",
          ticketStageId: "new",
          ticketSubjectPrefix: "Implementation",
        }),
      }),
    );
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toEqual({
      enabled: false,
      requiredProperties: ["dealname", "amount"],
      requireCompany: true,
      requireContact: false,
      ticketPipelineId: "support",
      ticketStageId: "new",
      ticketSubjectPrefix: "Implementation",
      ticketOwnerId: "",
      routes: [
        {
          id: "customer-success",
          name: "Customer success handoff",
          department: "Customer Success",
          outputType: "ticket",
          requiredProperties: ["dealname", "amount"],
          requireCompany: true,
          requireContact: false,
          pipelineId: "support",
          stageId: "new",
          subjectPrefix: "Implementation",
          ownerId: "",
          taskTemplates: [],
        },
      ],
    });

    const loaded = await app(
      new Request("http://localhost:8788/api/settings?portalId=123456"),
    );
    await expect(loaded.json()).resolves.toEqual({
      enabled: false,
      requiredProperties: ["dealname", "amount"],
      requireCompany: true,
      requireContact: false,
      ticketPipelineId: "support",
      ticketStageId: "new",
      ticketSubjectPrefix: "Implementation",
      ticketOwnerId: "",
      routes: [
        {
          id: "customer-success",
          name: "Customer success handoff",
          department: "Customer Success",
          outputType: "ticket",
          requiredProperties: ["dealname", "amount"],
          requireCompany: true,
          requireContact: false,
          pipelineId: "support",
          stageId: "new",
          subjectPrefix: "Implementation",
          ownerId: "",
          taskTemplates: [],
        },
      ],
    });
  });

  it("rejects invalid settings with a useful client error", async () => {
    const response = await createApp({
      HUBSPOT_CLIENT_ID: "local",
      HUBSPOT_CLIENT_SECRET: "local",
      PUBLIC_URL: "http://localhost:8788",
      TOKEN_ENCRYPTION_KEY: "local",
      ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS: "true",
    })(
      new Request("http://localhost:8788/api/settings?portalId=invalid", {
        method: "PUT",
        body: "{}",
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A valid portalId is required.",
    });
  });
});
