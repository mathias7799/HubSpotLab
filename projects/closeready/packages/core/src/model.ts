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

export interface ReadinessRule {
  id: string;
  pipelineId: string;
  targetStageId: string;
  label: string;
  factKey: string;
  operator: RuleOperator;
  expectedValue?: FactValue;
  severity: RuleSeverity;
  enabled: boolean;
  nativeEnforcement: boolean;
}

export interface DealSnapshot {
  dealId: string;
  pipelineId: string;
  currentStageId: string;
  targetStageId: string;
  facts: Readonly<Record<string, FactValue | undefined>>;
}

export interface RuleResult {
  rule: ReadinessRule;
  passed: boolean;
  actualValue: FactValue | undefined;
  message: string;
}

export interface ReadinessEvaluation {
  dealId: string;
  pipelineId: string;
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
  field: keyof ReadinessRule;
  message: string;
}
