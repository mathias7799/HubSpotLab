export { factCatalog } from "./catalog.js";
export { closedWonStarterRules } from "./defaults.js";
export { evaluateReadiness, evaluateRule, validateRule } from "./evaluate.js";
export {
  deserializeRule,
  ruleObjectDefinition,
  serializeRule,
  type RuleRecordProperties,
} from "./storage.js";
export type {
  DealSnapshot,
  FactDefinition,
  FactValue,
  ReadinessEvaluation,
  ReadinessRule,
  RuleOperator,
  RuleResult,
  RuleSeverity,
  RuleValidationIssue,
} from "./model.js";
