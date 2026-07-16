import type { ReadinessRule } from "./model.ts";

export function sameRuleDefinition(
  left: ReadinessRule,
  right: ReadinessRule,
): boolean {
  return (
    left.pipelineId === right.pipelineId &&
    left.fromStageId === right.fromStageId &&
    left.targetStageId === right.targetStageId &&
    left.operator === right.operator &&
    JSON.stringify(left.subject) === JSON.stringify(right.subject) &&
    JSON.stringify(left.expectedValue ?? null) ===
      JSON.stringify(right.expectedValue ?? null)
  );
}

export function findDuplicateRule(
  candidate: ReadinessRule,
  rules: ReadinessRule[],
): ReadinessRule | undefined {
  return rules.find(
    (rule) => rule.id !== candidate.id && sameRuleDefinition(candidate, rule),
  );
}
