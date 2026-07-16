import { describe, expect, it } from "vitest";

import type { ReadinessRule } from "./model.ts";
import { findDuplicateRule, sameRuleDefinition } from "./rules.ts";

const base: ReadinessRule = {
  id: "one",
  pipelineId: "default",
  fromStageId: "qualified",
  targetStageId: "closedwon",
  label: "Amount",
  subject: { kind: "deal_property", propertyName: "amount" },
  operator: "present",
  severity: "blocker",
  enabled: true,
  nativeEnforcement: false,
};

describe("rule management", () => {
  it("detects the same transition requirement despite display changes", () => {
    expect(
      sameRuleDefinition(base, {
        ...base,
        id: "two",
        label: "Deal amount",
        severity: "warning",
        enabled: false,
      }),
    ).toBe(true);
  });

  it("allows the same requirement on another transition", () => {
    expect(
      sameRuleDefinition(base, { ...base, targetStageId: "closedlost" }),
    ).toBe(false);
  });

  it("ignores the current rule while editing", () => {
    expect(findDuplicateRule(base, [base])).toBeUndefined();
    expect(findDuplicateRule({ ...base, id: "two" }, [base])).toEqual(base);
  });
});
