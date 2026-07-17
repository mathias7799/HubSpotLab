import { describe, expect, it, vi } from "vitest";

import {
  createConfigurationStore,
  MemoryConfigurationStore,
  UpstashConfigurationStore,
} from "../src/index.js";
import { fetcher, runtimeConfig } from "./helpers.js";

describe("configuration stores", () => {
  it("stores defensive JSON values in memory", async () => {
    const store = new MemoryConfigurationStore();
    const value = { enabled: true, labels: ["one"] };
    await store.put(123, "app.settings", value);
    value.labels.push("mutated");
    expect(await store.get(123, "app.settings")).toEqual({
      enabled: true,
      labels: ["one"],
    });
    await store.delete(123, "app.settings");
    expect(await store.get(123, "app.settings")).toBeNull();
  });

  it("isolates portals and validates keys and payload size", async () => {
    const store = new MemoryConfigurationStore();
    await store.put(123, "app.settings", { enabled: true });
    expect(await store.get(456, "app.settings")).toBeNull();
    await expect(store.put(123, "../unsafe", true)).rejects.toThrow(
      "Configuration key",
    );
    await expect(store.put(123, "large", "x".repeat(65_537))).rejects.toThrow(
      "64 KiB",
    );
    await expect(store.put(123, "not-finite", Number.NaN)).rejects.toThrow(
      "valid JSON",
    );
  });

  it("encrypts namespaced Upstash values", async () => {
    const calls: string[][] = [];
    let encrypted: string | undefined;
    const mockFetch = vi.fn(
      fetcher(async (_input, init) => {
        const command = JSON.parse(String(init?.body)) as string[];
        calls.push(command);
        if (command[0] === "SET") encrypted = command[2];
        return Response.json({
          result: command[0] === "GET" ? encrypted : "OK",
        });
      }),
    );
    const store = new UpstashConfigurationStore(
      "https://redis.example.test",
      "token",
      "encryption-key",
      "example-app",
      mockFetch,
    );
    await store.put(123, "app.settings", { secret: "hidden-value" });
    expect(encrypted).not.toContain("hidden-value");
    expect(await store.get(123, "app.settings")).toEqual({
      secret: "hidden-value",
    });
    expect(calls[0]?.[1]).toBe(
      "spotkit:example-app:configuration:123:app.settings",
    );
  });

  it("requires durable storage in production", () => {
    expect(() =>
      createConfigurationStore(
        runtimeConfig({ upstashUrl: undefined, upstashToken: undefined }),
      ),
    ).toThrow("Durable encrypted configuration storage");
  });
});
