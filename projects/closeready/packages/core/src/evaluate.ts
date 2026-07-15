import { factCatalog } from "./catalog.js";
import type {
  DealSnapshot,
  FactValue,
  ReadinessEvaluation,
  ReadinessRule,
  RuleResult,
  RuleValidationIssue,
} from "./model.js";

export function evaluateReadiness(
  rules: readonly ReadinessRule[],
  snapshot: DealSnapshot,
): ReadinessEvaluation {
  const applicable = rules.filter(
    (rule) =>
      rule.enabled &&
      rule.pipelineId === snapshot.pipelineId &&
      rule.targetStageId === snapshot.targetStageId,
  );
  const results = applicable.map((rule) => evaluateRule(rule, snapshot));
  const blockers = results.filter(
    (result) => !result.passed && result.rule.severity === "blocker",
  );
  const warnings = results.filter(
    (result) => !result.passed && result.rule.severity === "warning",
  );

  return {
    dealId: snapshot.dealId,
    pipelineId: snapshot.pipelineId,
    targetStageId: snapshot.targetStageId,
    ready: blockers.length === 0,
    score: readinessScore(results),
    results,
    blockers,
    warnings,
  };
}

export function evaluateRule(
  rule: ReadinessRule,
  snapshot: DealSnapshot,
): RuleResult {
  const actualValue = snapshot.facts[rule.factKey];
  const passed = compare(actualValue, rule.operator, rule.expectedValue);
  return {
    rule,
    passed,
    actualValue,
    message: passed
      ? `${rule.label} is complete.`
      : failureMessage(rule, actualValue),
  };
}

export function validateRule(rule: ReadinessRule): RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];
  if (!rule.label.trim()) {
    issues.push({ field: "label", message: "Rule label is required." });
  }
  if (!rule.pipelineId.trim()) {
    issues.push({ field: "pipelineId", message: "Pipeline is required." });
  }
  if (!rule.targetStageId.trim()) {
    issues.push({
      field: "targetStageId",
      message: "Target stage is required.",
    });
  }
  const fact = factCatalog.find((item) => item.key === rule.factKey);
  if (!fact) {
    issues.push({ field: "factKey", message: "Unknown readiness data point." });
  } else {
    if (!fact.supportedOperators.includes(rule.operator)) {
      issues.push({
        field: "operator",
        message: `${fact.label} does not support ${rule.operator}.`,
      });
    }
    if (rule.nativeEnforcement && !fact.nativeRequiredCompatible) {
      issues.push({
        field: "nativeEnforcement",
        message:
          "Only deal properties can be mirrored as native required-stage fields.",
      });
    }
  }
  if (needsExpectedValue(rule.operator) && rule.expectedValue === undefined) {
    issues.push({
      field: "expectedValue",
      message: "This operator requires an expected value.",
    });
  }
  return issues;
}

function compare(
  actual: FactValue | undefined,
  operator: ReadinessRule["operator"],
  expected: FactValue | undefined,
): boolean {
  switch (operator) {
    case "present":
      return isPresent(actual);
    case "equals":
      return scalar(actual) === scalar(expected);
    case "not_equals":
      return scalar(actual) !== scalar(expected);
    case "contains":
      return Array.isArray(actual)
        ? actual.map(String).includes(String(expected))
        : String(actual ?? "").includes(String(expected ?? ""));
    case "count_at_least":
      return count(actual) >= Number(expected);
    case "greater_or_equal":
      return Number(actual) >= Number(expected);
    case "is_true":
      return actual === true;
  }
}

function readinessScore(results: readonly RuleResult[]): number {
  if (results.length === 0) return 100;
  const weight = (result: RuleResult) =>
    result.rule.severity === "blocker" ? 3 : 1;
  const possible = results.reduce((total, result) => total + weight(result), 0);
  const achieved = results
    .filter((result) => result.passed)
    .reduce((total, result) => total + weight(result), 0);
  return Math.round((achieved / possible) * 100);
}

function isPresent(value: FactValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function scalar(value: FactValue | undefined): string {
  return Array.isArray(value)
    ? value.map(String).join(",")
    : String(value ?? "");
}

function count(value: FactValue | undefined): number {
  return Array.isArray(value) ? value.length : Number(value ?? 0);
}

function needsExpectedValue(operator: ReadinessRule["operator"]): boolean {
  return !["present", "is_true"].includes(operator);
}

function failureMessage(
  rule: ReadinessRule,
  actual: FactValue | undefined,
): string {
  if (rule.operator === "present") return `${rule.label} is missing.`;
  return `${rule.label} expected ${String(rule.expectedValue)}, received ${String(actual ?? "nothing")}.`;
}
