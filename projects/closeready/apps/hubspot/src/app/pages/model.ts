export type AssociatedObjectType = "contacts" | "companies";
export type RuleOperator =
  | "present"
  | "equals"
  | "not_equals"
  | "contains"
  | "count_at_least"
  | "greater_or_equal"
  | "is_true";

export type RuleSubject =
  | { kind: "deal_property"; propertyName: string }
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
      quantifier: "any" | "all";
    }
  | {
      kind: "metric";
      metric: "line_item_count" | "approved_quote_count" | "open_task_count";
    };

export interface ReadinessRule {
  id: string;
  pipelineId: string;
  fromStageId: string;
  targetStageId: string;
  label: string;
  subject: RuleSubject;
  operator: RuleOperator;
  expectedValue?: string | number | boolean | null | string[] | number[];
  severity: "blocker" | "warning";
  enabled: boolean;
  nativeEnforcement: boolean;
}
