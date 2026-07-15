import type {
  AssociatedObjectType,
  AssociatedRecordQuantifier,
  DealMetric,
  FactValue,
  ReadinessRule,
  RuleOperator,
  RuleSeverity,
  RuleSubject,
} from "./model.js";

export const ruleObjectDefinition = {
  name: "closeready_rule",
  labels: { singular: "CloseReady rule", plural: "CloseReady rules" },
  primaryDisplayProperty: "rule_name",
  properties: [
    "rule_name",
    "pipeline_id",
    "from_stage_id",
    "target_stage_id",
    "subject_kind",
    "object_type",
    "property_name",
    "association_label",
    "quantifier",
    "metric",
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
    from_stage_id: rule.fromStageId,
    target_stage_id: rule.targetStageId,
    subject_kind: rule.subject.kind,
    object_type: subjectField(rule.subject, "objectType"),
    property_name: subjectField(rule.subject, "propertyName"),
    association_label: subjectField(rule.subject, "associationLabel"),
    quantifier: subjectField(rule.subject, "quantifier"),
    metric: subjectField(rule.subject, "metric"),
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
    !properties.from_stage_id ||
    !properties.target_stage_id ||
    !isOperator(properties.operator) ||
    !isSeverity(properties.severity)
  ) {
    return null;
  }
  const subject = deserializeSubject(properties);
  if (!subject) return null;
  const expectedValue = deserializeValue(
    properties.expected_value,
    properties.expected_value_type,
  );
  return {
    id,
    label: properties.rule_name,
    pipelineId: properties.pipeline_id,
    fromStageId: properties.from_stage_id,
    targetStageId: properties.target_stage_id,
    subject,
    operator: properties.operator,
    ...(expectedValue === undefined ? {} : { expectedValue }),
    severity: properties.severity,
    enabled: properties.enabled !== "false",
    nativeEnforcement: properties.native_enforcement === "true",
  };
}

function deserializeSubject(
  properties: Partial<RuleRecordProperties>,
): RuleSubject | null {
  switch (properties.subject_kind) {
    case "deal_property":
      return properties.property_name
        ? { kind: "deal_property", propertyName: properties.property_name }
        : null;
    case "associated_record_count":
      return isObjectType(properties.object_type)
        ? {
            kind: "associated_record_count",
            objectType: properties.object_type,
            ...(properties.association_label
              ? { associationLabel: properties.association_label }
              : {}),
          }
        : null;
    case "associated_record_property":
      return isObjectType(properties.object_type) &&
        properties.property_name &&
        isQuantifier(properties.quantifier)
        ? {
            kind: "associated_record_property",
            objectType: properties.object_type,
            propertyName: properties.property_name,
            quantifier: properties.quantifier,
            ...(properties.association_label
              ? { associationLabel: properties.association_label }
              : {}),
          }
        : null;
    case "metric":
      return isMetric(properties.metric)
        ? { kind: "metric", metric: properties.metric }
        : null;
    default:
      return null;
  }
}

function subjectField<K extends string>(subject: RuleSubject, key: K): string {
  return key in subject
    ? String(subject[key as keyof typeof subject] ?? "")
    : "";
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

function isObjectType(
  value: string | undefined,
): value is AssociatedObjectType {
  return value === "contacts" || value === "companies";
}

function isQuantifier(
  value: string | undefined,
): value is AssociatedRecordQuantifier {
  return value === "any" || value === "all";
}

function isMetric(value: string | undefined): value is DealMetric {
  return [
    "line_item_count",
    "approved_quote_count",
    "open_task_count",
  ].includes(value ?? "");
}
