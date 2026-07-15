import { describe, expect, it } from "vitest";

import {
  closedWonStarterRules,
  decisionMakerStarterRules,
  deserializeRule,
  evaluateReadiness,
  serializeRule,
  validateRule,
  type DealSnapshot,
  type ReadinessRule,
  type RuleSubject,
} from "../src/index.js";

const rules = closedWonStarterRules("default", "closedwon");

function snapshot(overrides: Partial<DealSnapshot> = {}): DealSnapshot {
  return {
    dealId: "deal-1",
    pipelineId: "default",
    currentStageId: "presentationscheduled",
    targetStageId: "closedwon",
    dealProperties: {},
    contacts: [],
    companies: [],
    metrics: {
      line_item_count: 0,
      approved_quote_count: 0,
      open_task_count: 0,
    },
    ...overrides,
  };
}

function configuredRule(subject: RuleSubject): ReadinessRule {
  return {
    id: "rule-1",
    pipelineId: "default",
    fromStageId: "presentationscheduled",
    targetStageId: "closedwon",
    label: "Configured requirement",
    subject,
    operator: "present",
    severity: "blocker",
    enabled: true,
    nativeEnforcement: false,
  };
}

describe("evaluateReadiness", () => {
  it("allows closed won when every starter blocker passes", () => {
    const result = evaluateReadiness(
      rules,
      snapshot({
        dealProperties: { amount: 1000, closedate: "2026-07-31" },
        contacts: [{ id: "1", labels: [], properties: {} }],
        metrics: {
          line_item_count: 2,
          approved_quote_count: 0,
          open_task_count: 0,
        },
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks and explains every missing starter requirement", () => {
    const result = evaluateReadiness(rules, snapshot());
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(4);
    expect(result.blockers.map((item) => item.rule.label)).toContain(
      "At least one associated contact",
    );
  });

  it("applies a rule only to its exact source-to-target transition", () => {
    const exact = configuredRule({
      kind: "deal_property",
      propertyName: "contract_number",
    });
    expect(evaluateReadiness([exact], snapshot()).results).toHaveLength(1);
    expect(
      evaluateReadiness([exact], snapshot({ currentStageId: "qualifiedtobuy" }))
        .results,
    ).toHaveLength(0);
  });

  it("supports wildcard source stages", () => {
    const wildcard = { ...rules[0]!, fromStageId: "*" };
    const result = evaluateReadiness(
      [wildcard],
      snapshot({
        currentStageId: "any-stage",
        dealProperties: { amount: 500 },
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.results).toHaveLength(1);
  });

  it("supports arbitrary required deal properties", () => {
    const rule = configuredRule({
      kind: "deal_property",
      propertyName: "legal_approval_code",
    });
    expect(evaluateReadiness([rule], snapshot()).ready).toBe(false);
    expect(
      evaluateReadiness(
        [rule],
        snapshot({ dealProperties: { legal_approval_code: "OK-42" } }),
      ).ready,
    ).toBe(true);
  });

  it("requires an association with a specific label", () => {
    const rule: ReadinessRule = {
      ...configuredRule({
        kind: "associated_record_count",
        objectType: "contacts",
        associationLabel: "Decision maker",
      }),
      operator: "count_at_least",
      expectedValue: 1,
    };
    const wrongLabel = snapshot({
      contacts: [{ id: "1", labels: ["Billing contact"], properties: {} }],
    });
    const correctLabel = snapshot({
      contacts: [{ id: "1", labels: ["decision MAKER"], properties: {} }],
    });
    expect(
      evaluateReadiness([rule], wrongLabel).blockers[0]?.message,
    ).toContain("labeled “Decision maker”");
    expect(evaluateReadiness([rule], correctLabel).ready).toBe(true);
  });

  it("requires a property on any matching associated contact", () => {
    const rule = configuredRule({
      kind: "associated_record_property",
      objectType: "contacts",
      associationLabel: "Decision maker",
      propertyName: "email",
      quantifier: "any",
    });
    const result = evaluateReadiness(
      [rule],
      snapshot({
        contacts: [
          { id: "empty", labels: ["Decision maker"], properties: {} },
          {
            id: "complete",
            labels: ["Decision maker"],
            properties: { email: "buyer@example.com" },
          },
        ],
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.results[0]?.matchedRecordIds).toEqual(["empty", "complete"]);
  });

  it("fails all-quantified company fields when one company is incomplete", () => {
    const rule = configuredRule({
      kind: "associated_record_property",
      objectType: "companies",
      propertyName: "industry",
      quantifier: "all",
    });
    const result = evaluateReadiness(
      [rule],
      snapshot({
        companies: [
          { id: "complete", labels: [], properties: { industry: "Software" } },
          { id: "incomplete", labels: [], properties: {} },
        ],
      }),
    );
    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.failingRecordIds).toEqual(["incomplete"]);
    expect(result.blockers[0]?.message).toContain("1 of 2");
  });

  it("fails associated-property rules clearly when no labeled record exists", () => {
    const rule = configuredRule({
      kind: "associated_record_property",
      objectType: "contacts",
      associationLabel: "Decision maker",
      propertyName: "phone",
      quantifier: "any",
    });
    const result = evaluateReadiness([rule], snapshot());
    expect(result.ready).toBe(false);
    expect(result.blockers[0]?.message).toContain("but none was found");
  });

  it("does not let warnings block a transition", () => {
    const warning: ReadinessRule = {
      ...configuredRule({ kind: "deal_property", propertyName: "notes" }),
      severity: "warning",
    };
    const result = evaluateReadiness([warning], snapshot());
    expect(result.ready).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.score).toBe(0);
  });

  it("treats zero and false as present values", () => {
    const present = configuredRule({
      kind: "deal_property",
      propertyName: "discount",
    });
    expect(
      evaluateReadiness(
        [present],
        snapshot({ dealProperties: { discount: 0 } }),
      ).ready,
    ).toBe(true);
  });
});

describe("rule templates and validation", () => {
  it("creates a Decision maker association, email, and phone template", () => {
    const template = decisionMakerStarterRules(
      "default",
      "presentationscheduled",
      "closedwon",
    );
    expect(template).toHaveLength(3);
    expect(
      template.every((rule) => rule.fromStageId === "presentationscheduled"),
    ).toBe(true);
    expect(template.map((rule) => rule.label)).toEqual([
      "Decision maker contact",
      "Decision maker email",
      "Decision maker phone",
    ]);
  });

  it("rejects native enforcement for association rules", () => {
    const invalid: ReadinessRule = {
      ...configuredRule({
        kind: "associated_record_count",
        objectType: "contacts",
      }),
      operator: "count_at_least",
      expectedValue: 1,
      nativeEnforcement: true,
    };
    expect(validateRule(invalid)).toContainEqual({
      field: "nativeEnforcement",
      message:
        "Only deal properties can be mirrored as native required-stage fields.",
    });
  });

  it("rejects native enforcement for associated contact/company fields", () => {
    const invalid = {
      ...configuredRule({
        kind: "associated_record_property",
        objectType: "companies",
        propertyName: "domain",
        quantifier: "any",
      }),
      nativeEnforcement: true,
    };
    expect(validateRule(invalid)).toContainEqual(
      expect.objectContaining({ field: "nativeEnforcement" }),
    );
  });

  it("rejects source-specific native enforcement", () => {
    const invalid = {
      ...configuredRule({ kind: "deal_property", propertyName: "amount" }),
      nativeEnforcement: true,
    };
    expect(validateRule(invalid)).toContainEqual({
      field: "fromStageId",
      message:
        "Native HubSpot requirements apply from every source stage; use the wildcard source stage.",
    });
  });
});

describe("rule storage", () => {
  it("round-trips every richer subject through one custom-object record", () => {
    const subjects: RuleSubject[] = [
      { kind: "deal_property", propertyName: "amount" },
      {
        kind: "associated_record_count",
        objectType: "contacts",
        associationLabel: "Decision maker",
      },
      {
        kind: "associated_record_property",
        objectType: "companies",
        associationLabel: "Primary",
        propertyName: "industry",
        quantifier: "all",
      },
      { kind: "metric", metric: "approved_quote_count" },
    ];
    for (const subject of subjects) {
      const original = configuredRule(subject);
      expect(deserializeRule(original.id, serializeRule(original))).toEqual(
        original,
      );
    }
  });

  it("rejects incomplete custom-object records", () => {
    expect(deserializeRule("broken", { rule_name: "Incomplete" })).toBeNull();
  });
});
