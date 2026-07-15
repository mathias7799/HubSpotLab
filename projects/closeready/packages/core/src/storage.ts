import type {
  FactValue,
  ReadinessRule,
  RuleOperator,
  RuleSeverity,
} from "./model.js";

export const ruleObjectDefinition = {
  name: "closeready_rule",
  labels: { singular: "CloseReady rule", plural: "CloseReady rules" },
  primaryDisplayProperty: "rule_name",
  properties: [
    "rule_name",
    "pipeline_id",
    "target_stage_id",
    "fact_key",
    "operator",
    "expected_value",
    "expected_value_type",
    "severity",
    "enabled",
    "native_enforcement",
  ],
} as const;

export type RuleRecordProperties = Record<
  (typeof ruleObjectDefinition.properties)[number],
  string
>;

export function serializeRule(rule: ReadinessRule): RuleRecordProperties {
  return {
    rule_name: rule.label,
    pipeline_id: rule.pipelineId,
    target_stage_id: rule.targetStageId,
    fact_key: rule.factKey,
    operator: rule.operator,
    expected_value: serializeValue(rule.expectedValue),
    expected_value_type: valueType(rule.expectedValue),
    severity: rule.severity,
    enabled: String(rule.enabled),
    native_enforcement: String(rule.nativeEnforcement),
  };
}

export function deserializeRule(
  id: string,
  properties: Partial<RuleRecordProperties>,
): ReadinessRule | null {
  if (
    !properties.rule_name ||
    !properties.pipeline_id ||
    !properties.target_stage_id ||
    !properties.fact_key ||
    !isOperator(properties.operator) ||
    !isSeverity(properties.severity)
  ) {
    return null;
  }
  const expectedValue = deserializeValue(
    properties.expected_value,
    properties.expected_value_type,
  );
  return {
    id,
    label: properties.rule_name,
    pipelineId: properties.pipeline_id,
    targetStageId: properties.target_stage_id,
    factKey: properties.fact_key,
    operator: properties.operator,
    ...(expectedValue === undefined ? {} : { expectedValue }),
    severity: properties.severity,
    enabled: properties.enabled !== "false",
    nativeEnforcement: properties.native_enforcement === "true",
  };
}

function serializeValue(value: FactValue | undefined): string {
  return value === undefined ? "" : JSON.stringify(value);
}

function deserializeValue(
  value: string | undefined,
  type: string | undefined,
): FactValue | undefined {
  if (!value || type === "undefined") return undefined;
  try {
    return JSON.parse(value) as FactValue;
  } catch {
    return undefined;
  }
}

function valueType(value: FactValue | undefined): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isOperator(value: string | undefined): value is RuleOperator {
  return [
    "present",
    "equals",
    "not_equals",
    "contains",
    "count_at_least",
    "greater_or_equal",
    "is_true",
  ].includes(value ?? "");
}

function isSeverity(value: string | undefined): value is RuleSeverity {
  return value === "blocker" || value === "warning";
}
