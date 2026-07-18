import { describe, expect, it, vi } from "vitest";

import { HubSpotObjectConfigurationStore } from "../src/index.js";
import { fetcher } from "./helpers.js";

describe("HubSpotObjectConfigurationStore", () => {
  it("provisions exactly one compact schema and stores encrypted values", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    let record: { id: string; properties: Record<string, string> } | undefined;
    const mockFetch = vi.fn(
      fetcher(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body
          ? (JSON.parse(String(init.body)) as unknown)
          : undefined;
        calls.push({ url, method, ...(body === undefined ? {} : { body }) });
        if (
          url.endsWith(
            "/crm-object-schemas/v3/schemas/p123_example_app_configuration",
          ) &&
          method === "GET"
        ) {
          return Response.json(
            { message: "Unable to infer object type" },
            { status: 400 },
          );
        }
        if (
          url.endsWith("/crm-object-schemas/v3/schemas") &&
          method === "POST"
        ) {
          return Response.json({
            name: "example_app_configuration",
            fullyQualifiedName: "p123_example_app_configuration",
          });
        }
        if (url.includes("idProperty=config_key")) {
          return record
            ? Response.json(record)
            : Response.json({ message: "Not found" }, { status: 404 });
        }
        if (method === "POST") {
          const properties = (body as { properties: Record<string, string> })
            .properties;
          record = { id: "9001", properties };
          return Response.json(record, { status: 201 });
        }
        if (method === "PATCH") {
          const properties = (body as { properties: Record<string, string> })
            .properties;
          record = { id: "9001", properties };
          return Response.json(record);
        }
        if (method === "DELETE") {
          record = undefined;
          return new Response(null, { status: 204 });
        }
        return Response.json(
          { message: "Unexpected request" },
          { status: 500 },
        );
      }),
    );
    const tokenProvider = vi.fn(async () => "portal-access-token");
    const store = new HubSpotObjectConfigurationStore({
      appName: "Example App",
      namespace: "example-app",
      encryptionKey: "encryption-key",
      accessTokenForPortal: tokenProvider,
      fetcher: mockFetch,
    });

    await store.put(123, "app.settings", { secret: "plain-value" });
    expect(record?.properties.config_key).toBe("app.settings");
    expect(record?.properties.encrypted_value).not.toContain("plain-value");
    expect(await store.get(123, "app.settings")).toEqual({
      secret: "plain-value",
    });
    await store.put(123, "app.settings", { secret: "updated" });
    expect(await store.get(123, "app.settings")).toEqual({ secret: "updated" });
    await store.delete(123, "app.settings");
    expect(await store.get(123, "app.settings")).toBeNull();

    const schemaCreates = calls.filter(
      (call) =>
        call.url.endsWith("/crm-object-schemas/v3/schemas") &&
        call.method === "POST",
    );
    expect(schemaCreates).toHaveLength(1);
    expect(schemaCreates[0]?.body).toMatchObject({
      name: "example_app_configuration",
      primaryDisplayProperty: "config_key",
      properties: [
        { name: "config_key", hasUniqueValue: true },
        { name: "encrypted_value" },
      ],
    });
    expect(JSON.stringify(schemaCreates[0]?.body)).not.toContain(
      "associatedObjects",
    );
    expect(tokenProvider).toHaveBeenCalledWith(123);
  });

  it("coalesces concurrent schema provisioning per portal", async () => {
    let schemaReads = 0;
    let schemaCreates = 0;
    const mockFetch = fetcher(async (input, init) => {
      const url = String(input);
      if (
        url.endsWith(
          "/crm-object-schemas/v3/schemas/p123_example_app_configuration",
        ) &&
        !init?.method
      ) {
        schemaReads += 1;
        await Promise.resolve();
        return Response.json({ message: "Not found" }, { status: 404 });
      }
      schemaCreates += 1;
      return Response.json({
        name: "example_app_configuration",
        fullyQualifiedName: "p123_example_app_configuration",
      });
    });
    const store = new HubSpotObjectConfigurationStore({
      appName: "Example App",
      namespace: "example-app",
      encryptionKey: "encryption-key",
      accessTokenForPortal: async () => "token",
      fetcher: mockFetch,
    });

    const [first, second] = await Promise.all([
      store.provision(123),
      store.provision(123),
    ]);
    expect(first).toEqual(second);
    expect(schemaReads).toBe(1);
    expect(schemaCreates).toBe(1);
  });

  it("supplies the default pipeline for administrator-created objects", async () => {
    const creates: Array<Record<string, string>> = [];
    const mockFetch = fetcher(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (
        url.endsWith(
          "/crm-object-schemas/v3/schemas/p123_example_app_configuration",
        )
      ) {
        return Response.json({
          name: "example_app_configuration",
          fullyQualifiedName: "p123_example_app_configuration",
          primaryDisplayProperty: "configuration_key",
        });
      }
      if (url.includes("idProperty=configuration_key")) {
        return new Response("Not found", { status: 404 });
      }
      if (url.endsWith("/crm/v3/pipelines/p123_example_app_configuration")) {
        return Response.json({
          results: [
            {
              id: "default",
              stages: [
                { id: "later", displayOrder: 2 },
                { id: "first", displayOrder: 0 },
              ],
            },
          ],
        });
      }
      if (method === "POST") {
        const body = JSON.parse(String(init?.body)) as {
          properties: Record<string, string>;
        };
        creates.push(body.properties);
        if (creates.length === 1) {
          return Response.json(
            { message: "Some required properties were not set." },
            { status: 400 },
          );
        }
        return Response.json({ id: "1", properties: body.properties });
      }
      return Response.json({ message: "Unexpected request" }, { status: 500 });
    });
    const store = new HubSpotObjectConfigurationStore({
      appName: "Example App",
      namespace: "example-app",
      encryptionKey: "encryption-key",
      accessTokenForPortal: async () => "token",
      fetcher: mockFetch,
    });

    await store.put(123, "app.settings", { enabled: true });

    expect(creates).toHaveLength(2);
    expect(creates[1]).toMatchObject({
      configuration_key: "app.settings",
      hs_pipeline: "default",
      hs_pipeline_stage: "first",
    });
  });

  it("isolates ciphertext by portal and key", async () => {
    const records = new Map<string, string>();
    const mockFetch = fetcher(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (
        url.endsWith(
          "/crm-object-schemas/v3/schemas/p123_example_app_configuration",
        ) &&
        method === "GET"
      ) {
        return Response.json({
          name: "example_app_configuration",
          fullyQualifiedName: "p123_example_app_configuration",
        });
      }
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      if (url.includes("idProperty=config_key")) {
        const key = decodeURIComponent(
          url
            .split("/crm/v3/objects/p123_example_app_configuration/")[1]!
            .split("?")[0]!,
        );
        const encrypted = records.get(key);
        return encrypted
          ? Response.json({
              id: "1",
              properties: { config_key: key, encrypted_value: encrypted },
            })
          : Response.json({ message: "Not found" }, { status: 404 });
      }
      const properties = body.properties as Record<string, string>;
      records.set(properties.config_key!, properties.encrypted_value!);
      return Response.json({ id: "1", properties });
    });
    const store = new HubSpotObjectConfigurationStore({
      appName: "Example App",
      namespace: "example-app",
      encryptionKey: "encryption-key",
      accessTokenForPortal: async () => "token",
      fetcher: mockFetch,
    });
    await store.put(123, "first", { value: true });
    records.set("second", records.get("first")!);
    await expect(store.get(123, "second")).rejects.toThrow();
  });
});
