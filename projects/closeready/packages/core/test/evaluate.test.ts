import { describe, expect, it } from "vitest";

import {
  closedWonStarterRules,
  deserializeRule,
  evaluateReadiness,
  serializeRule,
  validateRule,
  type DealSnapshot,
  type ReadinessRule,
} from "../src/index.js";

const rules = closedWonStarterRules("default", "closedwon");

function snapshot(
  facts: DealSnapshot["facts"],
  pipelineId = "default",
): DealSnapshot {
  return {
    dealId: "deal-1",
    pipelineId,
    currentStageId: "contractsent",
    targetStageId: "closedwon",
    facts,
  };
}

describe("evaluateReadiness", () => {
  it("allows closed won when every blocker passes", () => {
    const result = evaluateReadiness(
      rules,
      snapshot({
        "deal.amount": 1000,
        "deal.closedate": "2026-07-31",
        "associations.contacts.count": 1,
        "line_items.count": 2,
        "tasks.open.count": 0,
      }),
    );

    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks closed won and explains every missing requirement", () => {
    const result = evaluateReadiness(
      rules,
      snapshot({
        "deal.amount": "",
        "deal.closedate": null,
        "associations.contacts.count": 0,
        "line_items.count": 0,
        "tasks.open.count": 2,
      }),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(5);
    expect(result.blockers.map((item) => item.rule.label)).toContain(
      "At least one associated contact",
    );
  });

  it("only applies rules belonging to the selected pipeline", () => {
    const result = evaluateReadiness(rules, snapshot({}, "enterprise"));
    expect(result.ready).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it("does not let warnings block a transition", () => {
    const warning: ReadinessRule = {
      ...rules[0]!,
      id: "warning",
      severity: "warning",
    };
    const result = evaluateReadiness([warning], snapshot({}));
    expect(result.ready).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.score).toBe(0);
  });

  it("treats zero and false as present values", () => {
    const present = { ...rules[0]!, operator: "present" as const };
    expect(
      evaluateReadiness([present], snapshot({ "deal.amount": 0 })).ready,
    ).toBe(true);
  });
});

describe("validateRule", () => {
  it("rejects native enforcement for association rules", () => {
    const invalid: ReadinessRule = {
      ...rules[2]!,
      nativeEnforcement: true,
    };
    expect(validateRule(invalid)).toContainEqual({
      field: "nativeEnforcement",
      message:
        "Only deal properties can be mirrored as native required-stage fields.",
    });
  });
});

describe("rule storage", () => {
  it("round-trips a configured rule through one custom-object record", () => {
    const original = rules[2]!;
    expect(deserializeRule(original.id, serializeRule(original))).toEqual(
      original,
    );
  });

  it("rejects incomplete custom-object records", () => {
    expect(deserializeRule("broken", { rule_name: "Incomplete" })).toBeNull();
  });
});
