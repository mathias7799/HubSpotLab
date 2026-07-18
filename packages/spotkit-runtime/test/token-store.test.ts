import { describe, expect, it, vi } from "vitest";

import {
  createTokenStore,
  MemoryTokenStore,
  type Installation,
  UpstashTokenStore,
} from "../src/index.js";
import { fetcher, runtimeConfig } from "./helpers.js";

const installation: Installation = {
  portalId: 123,
  accessToken: "access-secret",
  refreshToken: "refresh-secret",
  expiresAt: Date.now() + 60_000,
  installedAt: Date.now(),
};

describe("token stores", () => {
  it("stores defensive copies in memory", async () => {
    const store = new MemoryTokenStore();
    await store.put(installation);
    installation.accessToken = "mutated";
    expect((await store.get(123))?.accessToken).toBe("access-secret");
    const read = await store.get(123);
    if (read) read.accessToken = "mutated-read";
    expect((await store.get(123))?.accessToken).toBe("access-secret");
    await store.delete(123);
    expect(await store.get(123)).toBeNull();
  });

  it("uses namespaced encrypted Upstash commands", async () => {
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
    const store = new UpstashTokenStore(
      "https://redis.example.test",
      "redis-token",
      "encryption-key",
      "example-app",
      mockFetch,
    );

    await store.put({ ...installation, accessToken: "access-secret" });
    expect(encrypted).not.toContain("access-secret");
    expect(await store.get(123)).toMatchObject({
      portalId: 123,
      accessToken: "access-secret",
    });
    await store.delete(123);
    expect(calls.map((call) => call.slice(0, 2))).toEqual([
      ["SET", "spotkit:example-app:installation:123"],
      ["GET", "spotkit:example-app:installation:123"],
      ["DEL", "spotkit:example-app:installation:123"],
    ]);
  });

  it("requires durable storage outside local development", () => {
    expect(() =>
      createTokenStore(
        runtimeConfig({ upstashUrl: undefined, upstashToken: undefined }),
      ),
    ).toThrow("Durable encrypted token storage");
    expect(
      createTokenStore(
        runtimeConfig({
          publicUrl: "http://localhost:8788",
          allowUnsignedDevelopmentRequests: true,
          upstashUrl: undefined,
          upstashToken: undefined,
        }),
      ),
    ).toBeInstanceOf(MemoryTokenStore);
    expect(
      createTokenStore(
        runtimeConfig({
          publicUrl: "https://temporary.trycloudflare.com",
          allowEphemeralTunnelDevelopment: true,
          upstashUrl: undefined,
          upstashToken: undefined,
        }),
      ),
    ).toBeInstanceOf(MemoryTokenStore);
  });
});
