import type {
  AssociatedRecordSnapshot,
  DealSnapshot,
  FactValue,
  ReadinessEvaluation,
  ReadinessRule,
  RuleResult,
  RuleSubject,
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
      (rule.fromStageId === "*" ||
        rule.fromStageId === snapshot.currentStageId) &&
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
    fromStageId: snapshot.currentStageId,
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
  if (rule.subject.kind === "associated_record_property") {
    return evaluateAssociatedProperty(rule, rule.subject, snapshot);
  }

  const actualValue = subjectValue(rule, snapshot);
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
  if (
    ![
      "present",
      "equals",
      "not_equals",
      "contains",
      "count_at_least",
      "greater_or_equal",
      "is_true",
    ].includes(rule.operator)
  ) {
    issues.push({ field: "operator", message: "Unsupported rule operator." });
  }
  if (!["blocker", "warning"].includes(rule.severity)) {
    issues.push({ field: "severity", message: "Unsupported rule severity." });
  }
  if (!rule.label.trim()) {
    issues.push({ field: "label", message: "Rule label is required." });
  }
  if (!rule.pipelineId.trim()) {
    issues.push({ field: "pipelineId", message: "Pipeline is required." });
  }
  if (!rule.fromStageId.trim()) {
    issues.push({ field: "fromStageId", message: "Source stage is required." });
  }
  if (!rule.targetStageId.trim()) {
    issues.push({
      field: "targetStageId",
      message: "Target stage is required.",
    });
  }
  validateSubject(rule, issues);
  if (needsExpectedValue(rule.operator) && rule.expectedValue === undefined) {
    issues.push({
      field: "expectedValue",
      message: "This operator requires an expected value.",
    });
  }
  return issues;
}

function validateSubject(
  rule: ReadinessRule,
  issues: RuleValidationIssue[],
): void {
  const { subject } = rule;
  if (
    (subject.kind === "deal_property" ||
      subject.kind === "associated_record_property") &&
    !subject.propertyName.trim()
  ) {
    issues.push({
      field: "subject.propertyName",
      message: "A property is required.",
    });
  }
  if (
    subject.kind === "associated_record_count" &&
    !["count_at_least", "greater_or_equal", "equals"].includes(rule.operator)
  ) {
    issues.push({
      field: "operator",
      message: "Association counts require a numeric count operator.",
    });
  }
  if (subject.kind === "metric" && rule.operator === "present") {
    issues.push({
      field: "operator",
      message: "Metrics require a numeric or equality operator.",
    });
  }
  if (rule.nativeEnforcement && subject.kind !== "deal_property") {
    issues.push({
      field: "nativeEnforcement",
      message:
        "Only deal properties can be mirrored as native required-stage fields.",
    });
  }
  if (rule.nativeEnforcement && rule.fromStageId !== "*") {
    issues.push({
      field: "fromStageId",
      message:
        "Native HubSpot requirements apply from every source stage; use the wildcard source stage.",
    });
  }
}

function subjectValue(
  rule: ReadinessRule,
  snapshot: DealSnapshot,
): FactValue | undefined {
  switch (rule.subject.kind) {
    case "deal_property":
      return snapshot.dealProperties[rule.subject.propertyName];
    case "associated_record_count":
      return matchingRecords(snapshot, rule.subject).length;
    case "metric":
      return snapshot.metrics[rule.subject.metric];
    case "associated_record_property":
      return undefined;
  }
}

function evaluateAssociatedProperty(
  rule: ReadinessRule,
  subject: Extract<RuleSubject, { kind: "associated_record_property" }>,
  snapshot: DealSnapshot,
): RuleResult {
  const records = matchingRecords(snapshot, subject);
  const evaluations = records.map((record) => ({
    record,
    value: record.properties[subject.propertyName],
    passed: compare(
      record.properties[subject.propertyName],
      rule.operator,
      rule.expectedValue,
    ),
  }));
  const passed =
    evaluations.length > 0 &&
    (subject.quantifier === "any"
      ? evaluations.some((item) => item.passed)
      : evaluations.every((item) => item.passed));
  const failing = evaluations.filter((item) => !item.passed);

  return {
    rule,
    passed,
    actualValue: evaluations.map((item) => String(item.value ?? "")),
    matchedRecordIds: records.map((record) => record.id),
    failingRecordIds: failing.map((item) => item.record.id),
    message: passed
      ? `${rule.label} is complete.`
      : associatedPropertyFailure(rule, subject, records, failing.length),
  };
}

function matchingRecords(
  snapshot: DealSnapshot,
  selector: {
    objectType: "contacts" | "companies";
    associationLabel?: string;
  },
): readonly AssociatedRecordSnapshot[] {
  const records = snapshot[selector.objectType];
  if (!selector.associationLabel) return records;
  const wanted = normalize(selector.associationLabel);
  return records.filter((record) =>
    record.labels.some((label) => normalize(label) === wanted),
  );
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
  if (rule.subject.kind === "associated_record_count") {
    const label = rule.subject.associationLabel
      ? ` labeled “${rule.subject.associationLabel}”`
      : "";
    return `${rule.label} needs more associated ${rule.subject.objectType}${label}; found ${String(actual ?? 0)}.`;
  }
  if (rule.operator === "present") return `${rule.label} is missing.`;
  return `${rule.label} expected ${String(rule.expectedValue)}, received ${String(actual ?? "nothing")}.`;
}

function associatedPropertyFailure(
  rule: ReadinessRule,
  subject: Extract<RuleSubject, { kind: "associated_record_property" }>,
  records: readonly AssociatedRecordSnapshot[],
  failingCount: number,
): string {
  const label = subject.associationLabel
    ? ` labeled “${subject.associationLabel}”`
    : "";
  if (records.length === 0) {
    return `${rule.label} needs an associated ${singular(subject.objectType)}${label}, but none was found.`;
  }
  if (subject.quantifier === "any") {
    return `${rule.label} is missing on every matching ${singular(subject.objectType)}.`;
  }
  return `${rule.label} is missing or invalid on ${failingCount} of ${records.length} matching ${subject.objectType}.`;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function singular(objectType: "contacts" | "companies"): string {
  return objectType === "contacts" ? "contact" : "company";
}
