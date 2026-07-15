import type { ReadinessRule } from "./model.js";

export function closedWonStarterRules(
  pipelineId: string,
  closedWonStageId: string,
): ReadinessRule[] {
  return [
    rule("amount", "Deal amount", "deal.amount", "present", true),
    rule("close-date", "Close date", "deal.closedate", "present", true),
    rule(
      "contact",
      "At least one associated contact",
      "associations.contacts.count",
      "count_at_least",
      false,
      1,
    ),
    rule(
      "line-item",
      "At least one line item",
      "line_items.count",
      "count_at_least",
      false,
      1,
    ),
    rule("open-tasks", "No open tasks", "tasks.open.count", "equals", false, 0),
  ];

  function rule(
    suffix: string,
    label: string,
    factKey: string,
    operator: ReadinessRule["operator"],
    nativeEnforcement: boolean,
    expectedValue?: number,
  ): ReadinessRule {
    return {
      id: `${pipelineId}:${closedWonStageId}:${suffix}`,
      pipelineId,
      targetStageId: closedWonStageId,
      label,
      factKey,
      operator,
      ...(expectedValue === undefined ? {} : { expectedValue }),
      severity: "blocker",
      enabled: true,
      nativeEnforcement,
    };
  }
}
