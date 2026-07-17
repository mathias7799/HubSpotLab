import { describe, expect, it, vi } from "vitest";

import {
  MemoryIdempotencyStore,
  UpstashIdempotencyStore,
} from "../src/index.js";
import { fetcher } from "./helpers.js";

describe("idempotency stores", () => {
  it("claims once, supports release, and expires memory claims", async () => {
    vi.useFakeTimers();
    const store = new MemoryIdempotencyStore();
    expect(await store.claim("event-1", 10)).toBe(true);
    expect(await store.claim("event-1", 10)).toBe(false);
    await store.release("event-1");
    expect(await store.claim("event-1", 10)).toBe(true);
    vi.advanceTimersByTime(10_001);
    expect(await store.claim("event-1", 10)).toBe(true);
    vi.useRealTimers();
  });

  it("uses atomic Upstash SET NX EX with hashed keys", async () => {
    const calls: string[][] = [];
    let claimed = false;
    const mockFetch = fetcher(async (_input, init) => {
      const command = JSON.parse(String(init?.body)) as string[];
      calls.push(command);
      if (command[0] === "DEL") {
        claimed = false;
        return Response.json({ result: 1 });
      }
      if (claimed) return Response.json({ result: null });
      claimed = true;
      return Response.json({ result: "OK" });
    });
    const store = new UpstashIdempotencyStore(
      "https://redis.example.test",
      "token",
      "example-app",
      mockFetch,
    );
    expect(await store.claim("private-event-value", 60)).toBe(true);
    expect(await store.claim("private-event-value", 60)).toBe(false);
    await store.release("private-event-value");
    expect(calls[0]?.slice(2)).toEqual(["1", "NX", "EX", "60"]);
    expect(calls[0]?.[1]).toMatch(
      /^spotkit:example-app:idempotency:[a-f0-9]{64}$/,
    );
    expect(calls[0]?.[1]).not.toContain("private-event-value");
  });
});
