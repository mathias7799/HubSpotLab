import { describe, expect, it } from "vitest";

import type { CatalogPipeline } from "./api.ts";
import type { ReadinessRule } from "./model.ts";
import { describeSources, ruleKindLabel, summarizeRules } from "./overview.ts";

const pipeline: CatalogPipeline = {
  id: "sales",
  label: "Sales",
  stages: [
    { id: "qualified", label: "Qualified", displayOrder: 0 },
    { id: "closedwon", label: "Closed won", displayOrder: 1 },
  ],
};

const rules: ReadinessRule[] = [
  {
    id: "amount",
    pipelineId: "sales",
    fromStageId: "qualified",
    targetStageId: "closedwon",
    label: "Amount",
    subject: { kind: "deal_property", propertyName: "amount" },
    operator: "present",
    severity: "blocker",
    enabled: true,
    nativeEnforcement: true,
  },
  {
    id: "decision-maker",
    pipelineId: "sales",
    fromStageId: "*",
    targetStageId: "closedwon",
    label: "Decision maker",
    subject: {
      kind: "associated_record_count",
      objectType: "contacts",
      associationLabel: "Decision maker",
    },
    operator: "count_at_least",
    expectedValue: 1,
    severity: "warning",
    enabled: true,
    nativeEnforcement: false,
  },
];

describe("CloseReady overview", () => {
  it("summarizes active rules and unique target-stage coverage", () => {
    expect(summarizeRules(rules, pipeline)).toEqual({
      total: 2,
      blockers: 1,
      warnings: 1,
      coveredStages: 1,
    });
  });

  it("describes exact, wildcard, and missing source stages", () => {
    expect(describeSources(new Set(["qualified"]), pipeline)).toBe(
      "Qualified",
    );
    expect(describeSources(new Set(["*"]), pipeline)).toBe("Any stage");
    expect(describeSources(new Set(), pipeline)).toBe("None");
  });

  it("uses stable labels for every supported requirement type", () => {
    expect(ruleKindLabel("deal_property")).toBe("Deal properties");
    expect(ruleKindLabel("associated_record_count")).toBe(
      "Required associations",
    );
    expect(ruleKindLabel("associated_record_property")).toBe(
      "Associated record properties",
    );
    expect(ruleKindLabel("metric")).toBe("Deal metrics");
  });
});
