import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

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

  it("locks down the installed confirmation page", async () => {
    const app = createApp({ config, store: new MemoryTokenStore() });
    const response = await app(new Request("http://localhost:8787/installed"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("requires signed HubSpot user metadata in production", async () => {
    const productionConfig: AppConfig = {
      ...config,
      publicUrl: "https://tidshub.example.com",
      allowUnsignedDevelopmentRequests: false,
    };
    const store = new MemoryTokenStore();
    await store.put({
      portalId: 123,
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 600_000,
      installedAt: Date.now(),
    });
    const app = createApp({
      config: productionConfig,
      store,
      fetcher: async () => Response.json({ results: [] }),
    });
    const missingIdentity = signedRequest(
      "https://tidshub.example.com/api/users?portalId=123",
      productionConfig.clientSecret,
    );
    const rejected = await app(missingIdentity);
    expect(rejected.status).toBe(401);
    await expect(rejected.json()).resolves.toEqual({
      error: "Missing signed HubSpot userId metadata.",
    });

    const accepted = await app(
      signedRequest(
        "https://tidshub.example.com/api/users?portalId=123&userId=456&userEmail=user%40example.com",
        productionConfig.clientSecret,
      ),
    );
    expect(accepted.status).toBe(200);
  });

  it("archives a new entry when writing an association fails", async () => {
    const { app, calls } = await associationFailureApp(false);

    const response = await app(entryCreationRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Association rejected for test.",
    });
    expect(calls).toContainEqual({
      method: "DELETE",
      path: "/crm/v3/objects/p123_tidshub_record/entry-1",
    });
  });

  it("returns a recoverable partial-write response when association cleanup fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { app } = await associationFailureApp(true);

    const response = await app(entryCreationRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "partial_write",
      entryId: "entry-1",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "TidsHub entry association rollback failed",
      expect.objectContaining({ entryId: "entry-1" }),
    );
    consoleError.mockRestore();
  });
});

async function associationFailureApp(cleanupFails: boolean) {
  const store = new MemoryTokenStore();
  await store.put({
    portalId: 123,
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: Date.now() + 600_000,
    installedAt: Date.now(),
  });
  const calls: Array<{ method: string; path: string }> = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    calls.push({ method, path });

    if (path === "/crm-object-schemas/v3/schemas") {
      return Response.json({
        results: [
          {
            name: "tidshub_record",
            labels: { singular: "TidsHub-post" },
            objectTypeId: "2-123",
            fullyQualifiedName: "p123_tidshub_record",
            primaryDisplayProperty: "record_name",
          },
        ],
      });
    }
    if (path === "/crm/v3/properties/p123_tidshub_record") {
      return Response.json({
        results: schemaPropertyNames.map((name) => ({ name })),
      });
    }
    if (path === "/crm/v3/objects/p123_tidshub_record/search") {
      return Response.json({ results: [] });
    }
    if (path === "/crm/v3/objects/p123_tidshub_record" && method === "POST") {
      return Response.json({ id: "entry-1", properties: {} });
    }
    if (path === "/crm/v4/associations/p123_tidshub_record/0-3/labels") {
      return Response.json({
        results: [
          {
            category: "USER_DEFINED",
            label: "TidsHub-post",
            typeId: 99,
          },
        ],
      });
    }
    if (path.includes("/associations/0-3/501")) {
      return Response.json(
        { message: "Association rejected for test." },
        { status: 400 },
      );
    }
    if (
      path === "/crm/v3/objects/p123_tidshub_record/entry-1" &&
      method === "DELETE"
    ) {
      return cleanupFails
        ? Response.json(
            { message: "Cleanup rejected for test." },
            { status: 500 },
          )
        : new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected HubSpot test request: ${method} ${path}`);
  });
  return { app: createApp({ config, store, fetcher }), calls };
}

function entryCreationRequest(): Request {
  return new Request("http://localhost:8787/api/entries?portalId=123", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: {
        record_name: "2026-07-18 - Test",
        week_key: "2026-W29",
        entry_date: "2026-07-18",
        duration_minutes: "60",
        category: "project",
        billable: "false",
        hubspot_user_id: "42",
        hubspot_user_email: "user@example.com",
      },
      associations: [{ objectTypeId: "0-3", objectId: "501" }],
    }),
  });
}

const schemaPropertyNames = [
  "record_name",
  "record_kind",
  "week_key",
  "entry_date",
  "duration_minutes",
  "category",
  "description",
  "billable",
  "hourly_rate",
  "weekly_minutes",
  "monday_minutes",
  "tuesday_minutes",
  "wednesday_minutes",
  "thursday_minutes",
  "friday_minutes",
  "saturday_minutes",
  "sunday_minutes",
  "record_status",
  "hubspot_user_id",
  "hubspot_user_email",
  "associated_object_type",
  "associated_object_id",
  "associated_object_label",
  "associated_task_id",
  "associated_task_label",
  "approval_officer_id",
  "approval_officer_email",
  "approved_by_id",
  "approved_by_email",
  "submitted_at",
  "approved_at",
  "manager_comment",
];

function signedRequest(url: string, secret: string): Request {
  const timestamp = String(Date.now());
  const signedUrl = url.replace(/%40/gi, "@");
  const signature = createHmac("sha256", secret)
    .update(`GET${signedUrl}${timestamp}`)
    .digest("base64");
  return new Request(url, {
    headers: {
      "x-hubspot-request-timestamp": timestamp,
      "x-hubspot-signature-v3": signature,
    },
  });
}
