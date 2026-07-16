import {
  deserializeRule,
  evaluateReadiness,
  ruleObjectDefinition,
  serializeRule,
  validateRule,
  type AssociatedRecordSnapshot,
  type DealSnapshot,
  type ReadinessEvaluation,
  type ReadinessRule,
  type RuleRecordProperties,
} from "@hubspotlab/closeready-core";

export interface RuleSchema {
  objectTypeId: string;
  fullyQualifiedName: string;
  propertyNames: string[];
}

export interface DealContext {
  dealId: string;
  pipelineId: string;
  currentStageId: string;
}

export interface PortalCatalog {
  pipelines: unknown[];
  dealProperties: unknown[];
  contactProperties: unknown[];
  companyProperties: unknown[];
  associationLabels: {
    contacts: AssociationLabel[];
    companies: AssociationLabel[];
  };
}

export interface AssociationLabel {
  category: string;
  typeId: number;
  label: string | null;
}

interface CrmRecord {
  id: string;
  properties: Record<string, string | null>;
}

interface AssociationEdge {
  toObjectId: number;
  associationTypes: AssociationLabel[];
}

export class CloseReadyHubSpotClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async ensureRuleSchema(): Promise<RuleSchema> {
    const response = await this.request<{ results?: unknown[] }>(
      "/crm-object-schemas/v3/schemas",
    );
    const existing = (response.results ?? []).map(asObject).find((schema) => {
      const labels = asObject(schema.labels);
      return (
        String(schema.name).toLowerCase() === ruleObjectDefinition.name ||
        String(labels.singular).toLowerCase() ===
          ruleObjectDefinition.labels.singular.toLowerCase()
      );
    });
    let schema = existing;
    if (!schema) {
      try {
        schema = await this.request<Record<string, unknown>>(
          "/crm-object-schemas/v3/schemas",
          { method: "POST", body: JSON.stringify(schemaDefinition) },
        );
      } catch (cause) {
        if (
          cause instanceof HubSpotApiError &&
          cause.message.toLowerCase().includes("scope")
        ) {
          throw new HubSpotApiError(
            409,
            "HubSpot requires a one-time administrator bootstrap for custom schema creation. Reauthorize the HubSpot CLI with schema-write access, create the supplied CloseReady schema, then retry setup.",
          );
        }
        throw cause;
      }
    }
    const normalized = normalizeSchema(schema);
    return normalized;
  }

  async catalog(): Promise<PortalCatalog> {
    const [pipelines, deal, contact, company, contactLabels, companyLabels] =
      await Promise.all([
        this.request<{ results?: unknown[] }>("/crm/v3/pipelines/deals"),
        this.request<{ results?: unknown[] }>("/crm/v3/properties/deals"),
        this.request<{ results?: unknown[] }>("/crm/v3/properties/contacts"),
        this.request<{ results?: unknown[] }>("/crm/v3/properties/companies"),
        this.associationLabels("contacts"),
        this.associationLabels("companies"),
      ]);
    return {
      pipelines: pipelines.results ?? [],
      dealProperties: visibleProperties(deal.results),
      contactProperties: visibleProperties(contact.results),
      companyProperties: visibleProperties(company.results),
      associationLabels: {
        contacts: contactLabels,
        companies: companyLabels,
      },
    };
  }

  async listRules(pipelineId?: string): Promise<ReadinessRule[]> {
    const schema = await this.ensureRuleSchema();
    const compact = usesCompactRuleStorage(schema);
    const body = {
      filterGroups:
        pipelineId && !compact
          ? [
              {
                filters: [
                  {
                    propertyName: "pipeline_id",
                    operator: "EQ",
                    value: pipelineId,
                  },
                ],
              },
            ]
          : [],
      properties: compact
        ? [ruleObjectDefinition.primaryDisplayProperty]
        : [...ruleObjectDefinition.properties],
      limit: 100,
    };
    const response = await this.request<{ results?: CrmRecord[] }>(
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}/search`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return (response.results ?? [])
      .map((record) => deserializeStoredRuleOrNull(record, compact))
      .filter((rule): rule is ReadinessRule => rule !== null)
      .filter((rule) => !pipelineId || rule.pipelineId === pipelineId);
  }

  async createRule(rule: ReadinessRule): Promise<ReadinessRule> {
    assertValidRule(rule);
    const schema = await this.ensureRuleSchema();
    const record = await this.request<CrmRecord>(
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          properties: storedRuleProperties(rule, schema),
        }),
      },
    );
    return deserializeStoredRule(record, usesCompactRuleStorage(schema));
  }

  async updateRule(rule: ReadinessRule): Promise<ReadinessRule> {
    assertValidRule(rule);
    const schema = await this.ensureRuleSchema();
    const record = await this.request<CrmRecord>(
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}/${encodeURIComponent(rule.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          properties: storedRuleProperties(rule, schema),
        }),
      },
    );
    return deserializeStoredRule(record, usesCompactRuleStorage(schema));
  }

  async deleteRule(ruleId: string): Promise<void> {
    const schema = await this.ensureRuleSchema();
    await this.request(
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}/${encodeURIComponent(ruleId)}`,
      { method: "DELETE" },
    );
  }

  async evaluateDeal(
    dealId: string,
    targetStageId: string,
    suppliedRules?: readonly ReadinessRule[],
  ): Promise<ReadinessEvaluation> {
    const allRules = suppliedRules ?? (await this.listRules());
    const relevant = allRules.filter(
      (rule) => rule.enabled && rule.targetStageId === targetStageId,
    );
    const snapshot = await this.collectDealSnapshot(
      dealId,
      targetStageId,
      relevant,
    );
    return evaluateReadiness(relevant, snapshot);
  }

  async dealContext(dealId: string): Promise<DealContext> {
    const deal = await this.readRecord("deals", dealId, [
      "pipeline",
      "dealstage",
    ]);
    return {
      dealId,
      pipelineId: deal.properties.pipeline ?? "",
      currentStageId: deal.properties.dealstage ?? "",
    };
  }

  async guardedTransition(
    dealId: string,
    targetStageId: string,
    suppliedRules?: readonly ReadinessRule[],
  ): Promise<ReadinessEvaluation> {
    const evaluation = await this.evaluateDeal(
      dealId,
      targetStageId,
      suppliedRules,
    );
    if (!evaluation.ready) return evaluation;
    await this.request(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { dealstage: targetStageId } }),
    });
    return evaluation;
  }

  async collectDealSnapshot(
    dealId: string,
    targetStageId: string,
    rules: readonly ReadinessRule[],
  ): Promise<DealSnapshot> {
    const dealPropertyNames = unique([
      "pipeline",
      "dealstage",
      ...rules.flatMap((rule) =>
        rule.subject.kind === "deal_property"
          ? [rule.subject.propertyName]
          : [],
      ),
    ]);
    const contactPropertyNames = requiredAssociatedProperties(
      rules,
      "contacts",
    );
    const companyPropertyNames = requiredAssociatedProperties(
      rules,
      "companies",
    );
    const [deal, contactEdges, companyEdges, lineItems, quotes, tasks] =
      await Promise.all([
        this.readRecord("deals", dealId, dealPropertyNames),
        this.readAssociations(dealId, "contacts"),
        this.readAssociations(dealId, "companies"),
        this.readAssociations(dealId, "line_items"),
        this.readAssociations(dealId, "quotes"),
        this.readAssociations(dealId, "tasks"),
      ]);
    const [contacts, companies, quoteRecords, taskRecords] = await Promise.all([
      this.readAssociatedRecords(
        "contacts",
        contactEdges,
        contactPropertyNames,
      ),
      this.readAssociatedRecords(
        "companies",
        companyEdges,
        companyPropertyNames,
      ),
      this.batchRead("quotes", quotes.map(edgeId), ["hs_status"]),
      this.batchRead("tasks", tasks.map(edgeId), ["hs_task_status"]),
    ]);
    return {
      dealId,
      pipelineId: deal.properties.pipeline ?? "",
      currentStageId: deal.properties.dealstage ?? "",
      targetStageId,
      dealProperties: deal.properties,
      contacts,
      companies,
      metrics: {
        line_item_count: lineItems.length,
        approved_quote_count: quoteRecords.filter(
          (record) => record.properties.hs_status === "APPROVED",
        ).length,
        open_task_count: taskRecords.filter(
          (record) => record.properties.hs_task_status !== "COMPLETED",
        ).length,
      },
    };
  }

  private async associationLabels(
    objectType: "contacts" | "companies",
  ): Promise<AssociationLabel[]> {
    const result = await this.request<{ results?: AssociationLabel[] }>(
      `/crm/v4/associations/deals/${objectType}/labels`,
    );
    return result.results ?? [];
  }

  private async readRecord(
    objectType: string,
    id: string,
    properties: readonly string[],
  ): Promise<CrmRecord> {
    const query = new URLSearchParams({ properties: properties.join(",") });
    return this.request<CrmRecord>(
      `/crm/v3/objects/${objectType}/${encodeURIComponent(id)}?${query}`,
    );
  }

  private async readAssociations(
    dealId: string,
    objectType: string,
  ): Promise<AssociationEdge[]> {
    const response = await this.request<{ results?: AssociationEdge[] }>(
      `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/${objectType}?limit=500`,
    );
    return response.results ?? [];
  }

  private async readAssociatedRecords(
    objectType: "contacts" | "companies",
    edges: readonly AssociationEdge[],
    properties: readonly string[],
  ): Promise<AssociatedRecordSnapshot[]> {
    const records = await this.batchRead(
      objectType,
      edges.map(edgeId),
      properties,
    );
    const edgesById = new Map(
      edges.map((edge) => [String(edge.toObjectId), edge]),
    );
    return records.map((record) => ({
      id: record.id,
      labels: (edgesById.get(record.id)?.associationTypes ?? [])
        .map((association) => association.label)
        .filter((label): label is string => Boolean(label)),
      properties: record.properties,
    }));
  }

  private async batchRead(
    objectType: string,
    ids: readonly string[],
    properties: readonly string[],
  ): Promise<CrmRecord[]> {
    if (ids.length === 0) return [];
    const response = await this.request<{ results?: CrmRecord[] }>(
      `/crm/v3/objects/${objectType}/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({
          inputs: ids.map((id) => ({ id })),
          properties: [...properties],
        }),
      },
    );
    return response.results ?? [];
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    headers.set("Content-Type", "application/json");
    const response = await this.fetcher(`https://api.hubapi.com${path}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    const body = text
      ? (JSON.parse(text) as T & { message?: string })
      : ({} as T);
    if (!response.ok) {
      throw new HubSpotApiError(
        response.status,
        (body as { message?: string }).message ??
          `HubSpot API failed with ${response.status}.`,
      );
    }
    return body;
  }
}

export class HubSpotApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const schemaProperties = [
  property("rule_name", "Rule name"),
  property("pipeline_id", "Pipeline ID"),
  property("from_stage_id", "From stage ID"),
  property("target_stage_id", "Target stage ID"),
  enumeration("subject_kind", "Requirement type", [
    "deal_property",
    "associated_record_count",
    "associated_record_property",
    "metric",
  ]),
  enumeration("object_type", "Associated object type", [
    "contacts",
    "companies",
  ]),
  property("property_name", "Property name"),
  property("association_label", "Association label"),
  enumeration("quantifier", "Matching records", ["any", "all"]),
  enumeration("metric", "Metric", [
    "line_item_count",
    "approved_quote_count",
    "open_task_count",
  ]),
  enumeration("operator", "Operator", [
    "present",
    "equals",
    "not_equals",
    "contains",
    "count_at_least",
    "greater_or_equal",
    "is_true",
  ]),
  property("expected_value", "Expected value", "string", "textarea"),
  property("expected_value_type", "Expected value type"),
  enumeration("severity", "Severity", ["blocker", "warning"]),
  boolProperty("enabled", "Enabled"),
  boolProperty("native_enforcement", "Native enforcement"),
] as const;

const schemaDefinition = {
  name: ruleObjectDefinition.name,
  labels: ruleObjectDefinition.labels,
  primaryDisplayProperty: ruleObjectDefinition.primaryDisplayProperty,
  properties: schemaProperties,
};

function property(
  name: string,
  label: string,
  type = "string",
  fieldType = "text",
) {
  return { name, label, type, fieldType };
}

function enumeration(name: string, label: string, values: readonly string[]) {
  return {
    ...property(name, label, "enumeration", "select"),
    options: values.map((value, displayOrder) => ({
      label: humanize(value),
      value,
      displayOrder,
      hidden: false,
    })),
  };
}

function boolProperty(name: string, label: string) {
  return {
    ...property(name, label, "bool", "booleancheckbox"),
    options: [
      { label: "Yes", value: "true", displayOrder: 0, hidden: false },
      { label: "No", value: "false", displayOrder: 1, hidden: false },
    ],
  };
}

function requiredAssociatedProperties(
  rules: readonly ReadinessRule[],
  objectType: "contacts" | "companies",
): string[] {
  return unique(
    rules.flatMap((rule) =>
      rule.subject.kind === "associated_record_property" &&
      rule.subject.objectType === objectType
        ? [rule.subject.propertyName]
        : [],
    ),
  );
}

function visibleProperties(results: unknown[] | undefined): unknown[] {
  return (results ?? []).filter((item) => !asObject(item).hidden);
}

function deserializeStoredRule(
  record: CrmRecord,
  compact: boolean,
): ReadinessRule {
  const rule = deserializeStoredRuleOrNull(record, compact);
  if (!rule)
    throw new HubSpotApiError(502, "HubSpot returned an invalid rule record.");
  return rule;
}

function deserializeStoredRuleOrNull(
  record: CrmRecord,
  compact: boolean,
): ReadinessRule | null {
  if (compact) {
    const value =
      record.properties[ruleObjectDefinition.primaryDisplayProperty];
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as ReadinessRule;
      const rule = { ...parsed, id: record.id };
      return validateRule(rule).length ? null : rule;
    } catch {
      return null;
    }
  }
  return deserializeRule(record.id, record.properties as RuleRecordProperties);
}

function storedRuleProperties(
  rule: ReadinessRule,
  schema: RuleSchema,
): Record<string, string> {
  return usesCompactRuleStorage(schema)
    ? {
        [ruleObjectDefinition.primaryDisplayProperty]: JSON.stringify({
          ...rule,
          id: "stored",
        }),
      }
    : serializeRule(rule);
}

function usesCompactRuleStorage(schema: RuleSchema): boolean {
  return !schema.propertyNames.includes("pipeline_id");
}

function assertValidRule(rule: ReadinessRule): void {
  const issues = validateRule(rule);
  if (issues.length) {
    throw new HubSpotApiError(
      400,
      issues.map((issue) => issue.message).join(" "),
    );
  }
}

function normalizeSchema(schema: Record<string, unknown>): RuleSchema {
  if (
    typeof schema.objectTypeId !== "string" ||
    typeof schema.fullyQualifiedName !== "string"
  ) {
    throw new HubSpotApiError(
      502,
      "HubSpot returned an incomplete rule schema.",
    );
  }
  return {
    objectTypeId: schema.objectTypeId,
    fullyQualifiedName: schema.fullyQualifiedName,
    propertyNames: Array.isArray(schema.properties)
      ? schema.properties
          .map(asObject)
          .map((property) => String(property.name ?? ""))
          .filter(Boolean)
      : [...ruleObjectDefinition.properties],
  };
}

function edgeId(edge: AssociationEdge): string {
  return String(edge.toObjectId);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
