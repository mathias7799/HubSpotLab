import type { CatalogPipeline } from "./api.ts";
import type { ReadinessRule, RuleSubject } from "./model.ts";

export interface OverviewSummary {
  total: number;
  blockers: number;
  warnings: number;
  coveredStages: number;
}

export function summarizeRules(
  rules: ReadinessRule[],
  pipeline: CatalogPipeline | undefined,
): OverviewSummary {
  const targetIds = new Set(rules.map((rule) => rule.targetStageId));
  return {
    total: rules.length,
    blockers: rules.filter((rule) => rule.severity === "blocker").length,
    warnings: rules.filter((rule) => rule.severity === "warning").length,
    coveredStages: pipeline
      ? pipeline.stages.filter((stage) => targetIds.has(stage.id)).length
      : 0,
  };
}

export function describeSources(
  sourceIds: Set<string>,
  pipeline: CatalogPipeline,
): string {
  if (!sourceIds.size) return "None";
  if (sourceIds.has("*")) return "Any stage";
  return [...sourceIds]
    .map((id) => pipeline.stages.find((stage) => stage.id === id)?.label ?? id)
    .join(", ");
}

export function ruleKindLabel(kind: RuleSubject["kind"]): string {
  switch (kind) {
    case "deal_property":
      return "Deal properties";
    case "associated_record_count":
      return "Required associations";
    case "associated_record_property":
      return "Associated record properties";
    case "metric":
      return "Deal metrics";
  }
}
