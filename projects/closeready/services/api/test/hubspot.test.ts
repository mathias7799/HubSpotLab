import { describe, expect, it } from "vitest";

import type { ReadinessRule } from "@hubspotlab/closeready-core";

import { CloseReadyHubSpotClient } from "../src/index.js";

const decisionMakerEmail: ReadinessRule = {
  id: "email",
  pipelineId: "default",
  fromStageId: "presentation",
  targetStageId: "closedwon",
  label: "Decision maker email",
  subject: {
    kind: "associated_record_property",
    objectType: "contacts",
    associationLabel: "Decision maker",
    propertyName: "email",
    quantifier: "any",
  },
  operator: "present",
  severity: "blocker",
  enabled: true,
  nativeEnforcement: false,
};

describe("CloseReadyHubSpotClient", () => {
  it("collects labeled associations and only the configured properties", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = new CloseReadyHubSpotClient(
      "token",
      mockHubSpot(requests, {
        "/crm/v3/objects/deals/42": {
          id: "42",
          properties: {
            pipeline: "default",
            dealstage: "presentation",
          },
        },
        "/crm/v4/objects/deals/42/associations/contacts": {
          results: [
            {
              toObjectId: 101,
              associationTypes: [
                { category: "USER_DEFINED", typeId: 31, label: "Decision maker" },
              ],
            },
          ],
        },
        "/crm/v4/objects/deals/42/associations/companies": { results: [] },
        "/crm/v4/objects/deals/42/associations/line_items": { results: [{}] },
        "/crm/v4/objects/deals/42/associations/quotes": { results: [] },
        "/crm/v4/objects/deals/42/associations/tasks": { results: [] },
        "/crm/v3/objects/contacts/batch/read": {
          results: [
            { id: "101", properties: { email: "buyer@example.com" } },
          ],
        },
      }),
    );

    const snapshot = await client.collectDealSnapshot(
      "42",
      "closedwon",
      [decisionMakerEmail],
    );

    expect(snapshot.contacts).toEqual([
      {
        id: "101",
        labels: ["Decision maker"],
        properties: { email: "buyer@example.com" },
      },
    ]);
    expect(snapshot.metrics.line_item_count).toBe(1);
    const contactBatch = requests.find((item) =>
      item.url.includes("/contacts/batch/read"),
    );
    expect(JSON.parse(String(contactBatch?.init?.body))).toMatchObject({
      properties: ["email"],
    });
  });

  it("discovers contact/company properties and association labels", async () => {
    const client = new CloseReadyHubSpotClient(
      "token",
      mockHubSpot([], {
        "/crm/v3/pipelines/deals": { results: [{ id: "default" }] },
        "/crm/v3/properties/deals": {
          results: [{ name: "amount" }, { name: "hidden", hidden: true }],
        },
        "/crm/v3/properties/contacts": { results: [{ name: "email" }] },
        "/crm/v3/properties/companies": { results: [{ name: "industry" }] },
        "/crm/v4/associations/deals/contacts/labels": {
          results: [
            { category: "USER_DEFINED", typeId: 31, label: "Decision maker" },
          ],
        },
        "/crm/v4/associations/deals/companies/labels": { results: [] },
      }),
    );
    const catalog = await client.catalog();
    expect(catalog.dealProperties).toEqual([{ name: "amount" }]);
    expect(catalog.associationLabels.contacts[0]?.label).toBe("Decision maker");
  });

  it("provisions one transition-aware rule object", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = new CloseReadyHubSpotClient(
      "token",
      mockHubSpot(requests, {
        "/crm-object-schemas/v3/schemas": [
          { results: [] },
          {
            objectTypeId: "2-123",
            fullyQualifiedName: "p1_closeready_rule",
          },
        ],
      }),
    );
    await client.ensureRuleSchema();
    const create = requests.find((item) => item.init?.method === "POST");
    const definition = JSON.parse(String(create?.init?.body)) as {
      name: string;
      properties: Array<{ name: string }>;
    };
    expect(definition.name).toBe("closeready_rule");
    expect(definition.properties.map((property) => property.name)).toEqual(
      expect.arrayContaining([
        "from_stage_id",
        "subject_kind",
        "association_label",
        "property_name",
        "quantifier",
      ]),
    );
  });
});

function mockHubSpot(
  requests: Array<{ url: string; init?: RequestInit }>,
  routes: Record<string, unknown | unknown[]>,
): typeof fetch {
  const callCounts = new Map<string, number>();
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, ...(init ? { init } : {}) });
    const pathname = new URL(url).pathname;
    const key = Object.keys(routes).find((route) => pathname === route);
    if (!key) {
      return Response.json({ message: `No mock for ${pathname}` }, { status: 404 });
    }
    const configured = routes[key];
    const index = callCounts.get(key) ?? 0;
    callCounts.set(key, index + 1);
    const body = Array.isArray(configured) ? configured[index] : configured;
    return Response.json(body ?? {});
  }) as typeof fetch;
}
