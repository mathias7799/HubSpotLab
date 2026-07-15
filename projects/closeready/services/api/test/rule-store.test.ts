import { describe, expect, it } from "vitest";

import type { ReadinessRule } from "@hubspotlab/closeready-core";

import { createApp, MemoryRuleStore } from "../src/index.js";

const rule: ReadinessRule = {
  id: "rule-1",
  pipelineId: "default",
  fromStageId: "*",
  targetStageId: "closedwon",
  label: "Amount is required",
  subject: { kind: "deal_property", propertyName: "amount" },
  operator: "present",
  severity: "blocker",
  enabled: true,
  nativeEnforcement: false,
};

describe("portable rule storage", () => {
  it("isolates portals, filters pipelines, and deletes rules", async () => {
    const store = new MemoryRuleStore();
    await store.put(1, rule);
    await store.put(1, { ...rule, id: "rule-2", pipelineId: "enterprise" });
    await store.put(2, { ...rule, id: "other-portal" });

    expect(await store.list(1, "default")).toEqual([rule]);
    expect(await store.list(2)).toHaveLength(1);

    await store.delete(1, rule.id);
    expect(await store.list(1, "default")).toEqual([]);
  });

  it("falls back when HubSpot disables custom objects", async () => {
    const store = new MemoryRuleStore();
    const app = createApp({
      accessTokenForPortal: async () => "token",
      verifyRequest: async () => undefined,
      ruleStore: store,
      ruleStorage: "auto",
      fetcher: (async () =>
        Response.json(
          { message: "This account does not have access to custom objects." },
          { status: 403 },
        )) as typeof fetch,
    });

    const provisioned = await app(request("/api/provision", "POST"));
    expect(provisioned.status).toBe(200);
    expect(await provisioned.json()).toMatchObject({
      mode: "external",
      durable: false,
    });

    const created = await app(request("/api/rules", "POST", rule));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: rule.id });

    const listed = await app(request("/api/rules", "GET"));
    expect(await listed.json()).toEqual({ results: [rule] });

    const deleted = await app(request(`/api/rules/${rule.id}`, "DELETE"));
    expect(deleted.status).toBe(200);
    expect(await store.list(148692618)).toEqual([]);
  });
});

function request(path: string, method: string, body?: unknown): Request {
  return new Request(
    `https://closeready.example.com${path}?portalId=148692618`,
    {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
