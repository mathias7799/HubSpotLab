import type { ReadinessRule, RuleSubject } from "./model.js";

export function closedWonStarterRules(
  pipelineId: string,
  closedWonStageId: string,
): ReadinessRule[] {
  return [
    rule(
      "amount",
      "Deal amount",
      { kind: "deal_property", propertyName: "amount" },
      "present",
      true,
    ),
    rule(
      "close-date",
      "Close date",
      { kind: "deal_property", propertyName: "closedate" },
      "present",
      true,
    ),
    rule(
      "contact",
      "At least one associated contact",
      { kind: "associated_record_count", objectType: "contacts" },
      "count_at_least",
      false,
      1,
    ),
    rule(
      "line-item",
      "At least one line item",
      { kind: "metric", metric: "line_item_count" },
      "count_at_least",
      false,
      1,
    ),
    rule(
      "open-tasks",
      "No open tasks",
      { kind: "metric", metric: "open_task_count" },
      "equals",
      false,
      0,
    ),
  ];

  function rule(
    suffix: string,
    label: string,
    subject: RuleSubject,
    operator: ReadinessRule["operator"],
    nativeEnforcement: boolean,
    expectedValue?: number,
  ): ReadinessRule {
    return {
      id: `${pipelineId}:${closedWonStageId}:${suffix}`,
      pipelineId,
      fromStageId: "*",
      targetStageId: closedWonStageId,
      label,
      subject,
      operator,
      ...(expectedValue === undefined ? {} : { expectedValue }),
      severity: "blocker",
      enabled: true,
      nativeEnforcement,
    };
  }
}

/**
 * A practical compound template: a deal cannot be won unless a Decision maker
 * is associated and at least one such contact has both email and phone.
 */
export function decisionMakerStarterRules(
  pipelineId: string,
  fromStageId: string,
  closedWonStageId: string,
  associationLabel = "Decision maker",
): ReadinessRule[] {
  const base = `${pipelineId}:${fromStageId}:${closedWonStageId}:decision-maker`;
  return [
    {
      id: `${base}:association`,
      pipelineId,
      fromStageId,
      targetStageId: closedWonStageId,
      label: `${associationLabel} contact`,
      subject: {
        kind: "associated_record_count",
        objectType: "contacts",
        associationLabel,
      },
      operator: "count_at_least",
      expectedValue: 1,
      severity: "blocker",
      enabled: true,
      nativeEnforcement: false,
    },
    ...["email", "phone"].map(
      (propertyName): ReadinessRule => ({
        id: `${base}:${propertyName}`,
        pipelineId,
        fromStageId,
        targetStageId: closedWonStageId,
        label: `${associationLabel} ${propertyName}`,
        subject: {
          kind: "associated_record_property",
          objectType: "contacts",
          associationLabel,
          propertyName,
          quantifier: "any",
        },
        operator: "present",
        severity: "blocker",
        enabled: true,
        nativeEnforcement: false,
      }),
    ),
  ];
}
