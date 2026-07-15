export type FactValue = string | number | boolean | null | string[] | number[];

export type RuleOperator =
  | "present"
  | "equals"
  | "not_equals"
  | "contains"
  | "count_at_least"
  | "greater_or_equal"
  | "is_true";

export type RuleSeverity = "blocker" | "warning";
export type AssociatedObjectType = "contacts" | "companies";
export type AssociatedRecordQuantifier = "any" | "all";
export type DealMetric =
  | "line_item_count"
  | "approved_quote_count"
  | "open_task_count";

export type RuleSubject =
  | {
      kind: "deal_property";
      propertyName: string;
    }
  | {
      kind: "associated_record_count";
      objectType: AssociatedObjectType;
      associationLabel?: string;
    }
  | {
      kind: "associated_record_property";
      objectType: AssociatedObjectType;
      associationLabel?: string;
      propertyName: string;
      quantifier: AssociatedRecordQuantifier;
    }
  | {
      kind: "metric";
      metric: DealMetric;
    };

export interface ReadinessRule {
  id: string;
  pipelineId: string;
  /** Use "*" when the rule applies from every source stage. */
  fromStageId: string;
  targetStageId: string;
  label: string;
  subject: RuleSubject;
  operator: RuleOperator;
  expectedValue?: FactValue;
  severity: RuleSeverity;
  enabled: boolean;
  nativeEnforcement: boolean;
}

export interface AssociatedRecordSnapshot {
  id: string;
  /** HubSpot association labels attached to this deal-to-record edge. */
  labels: readonly string[];
  properties: Readonly<Record<string, FactValue | undefined>>;
}

export interface DealSnapshot {
  dealId: string;
  pipelineId: string;
  currentStageId: string;
  targetStageId: string;
  dealProperties: Readonly<Record<string, FactValue | undefined>>;
  contacts: readonly AssociatedRecordSnapshot[];
  companies: readonly AssociatedRecordSnapshot[];
  metrics: Readonly<Record<DealMetric, number>>;
}

export interface RuleResult {
  rule: ReadinessRule;
  passed: boolean;
  actualValue: FactValue | undefined;
  message: string;
  matchedRecordIds?: string[];
  failingRecordIds?: string[];
}

export interface ReadinessEvaluation {
  dealId: string;
  pipelineId: string;
  fromStageId: string;
  targetStageId: string;
  ready: boolean;
  score: number;
  results: RuleResult[];
  blockers: RuleResult[];
  warnings: RuleResult[];
}

export interface FactDefinition {
  key: string;
  label: string;
  source: "deal" | "association" | "line_items" | "quotes" | "tasks";
  valueType: "string" | "number" | "boolean" | "count";
  nativeRequiredCompatible: boolean;
  supportedOperators: RuleOperator[];
}

export interface RuleValidationIssue {
  field: string;
  message: string;
}
