export interface TidsHubSchema {
  objectTypeId: string;
  fullyQualifiedName: string;
  primaryDisplayProperty: string;
}

export interface SearchResult {
  id: string;
  properties: Record<string, string | null>;
}

export interface HubSpotUser {
  id: string;
  email: string;
  label: string;
}

export interface CrmSearchResult {
  id: string;
  objectType: CrmObjectType;
  objectTypeId: string;
  label: string;
  secondary: string;
}

export interface ApprovalSettings {
  id: string;
  ownerId: string;
  ownerEmail: string;
  approverId: string;
  approverEmail: string;
}

export interface WeekApproval {
  id: string;
  weekKey: string;
  ownerId: string;
  ownerEmail: string;
  approverId: string;
  approverEmail: string;
  status: string;
  totalMinutes: number;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
}

export type CrmObjectType = "contacts" | "companies" | "deals" | "tickets";

export class HubSpotClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async ensureSchema(): Promise<TidsHubSchema> {
    const schemas = await this.request<{ results?: unknown[] }>(
      "/crm-object-schemas/v3/schemas",
    );
    const existing = (schemas.results ?? [])
      .map(asObject)
      .find(
        (schema) =>
          ["tidshub_record", "tidshub_poster"].includes(String(schema.name)) ||
          asObject(schema.labels).singular === "TidsHub-post",
      );

    const schema =
      existing ??
      (await this.request<Record<string, unknown>>(
        "/crm-object-schemas/v3/schemas",
        { method: "POST", body: JSON.stringify(schemaDefinition) },
      ));
    const normalized = normalizeSchema(schema);
    await this.ensureProperties(normalized.fullyQualifiedName);
    return normalized;
  }

  async searchEntries(input: {
    objectType: string;
    from: string;
    to: string;
    ownerId?: string;
  }): Promise<SearchResult[]> {
    const filters: Array<Record<string, string>> = [
      { propertyName: "record_kind", operator: "EQ", value: "time_entry" },
      {
        propertyName: "entry_date",
        operator: "GTE",
        value: searchDateValue(input.from),
      },
      {
        propertyName: "entry_date",
        operator: "LTE",
        value: searchDateValue(input.to),
      },
    ];
    if (input.ownerId) {
      filters.push({
        propertyName: "hubspot_owner_id",
        operator: "EQ",
        value: input.ownerId,
      });
    }
    const result = await this.request<{ results?: SearchResult[] }>(
      `/crm/v3/objects/${encodeURIComponent(input.objectType)}/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters }],
          properties: entryProperties,
          sorts: ["entry_date"],
          after: "0",
          limit: 100,
        }),
      },
    );
    return Array.isArray(result.results) ? result.results : [];
  }

  async createEntry(
    objectType: string,
    primaryDisplayProperty: string,
    properties: Record<string, string>,
  ): Promise<SearchResult> {
    return this.createCustomRecord(
      objectType,
      primaryDisplayProperty,
      "time_entry",
      properties,
    );
  }

  async updateEntry(input: {
    objectType: string;
    entryId: string;
    ownerId: string;
    properties: Record<string, string>;
  }): Promise<SearchResult> {
    const record = await this.getMutableEntry(
      input.objectType,
      input.entryId,
      input.ownerId,
    );
    const updated = await this.updateCustomRecord(
      input.objectType,
      input.entryId,
      input.properties,
    );
    return {
      id: record.id,
      properties: { ...record.properties, ...updated.properties },
    };
  }

  async deleteEntry(input: {
    objectType: string;
    entryId: string;
    ownerId: string;
  }): Promise<void> {
    await this.getMutableEntry(input.objectType, input.entryId, input.ownerId);
    await this.request(
      `/crm/v3/objects/${encodeURIComponent(input.objectType)}/${encodeURIComponent(input.entryId)}`,
      { method: "DELETE" },
    );
  }

  async listUsers(): Promise<HubSpotUser[]> {
    const response = await this.request<{
      results?: Array<{
        userId?: number;
        email?: string;
        firstName?: string;
        lastName?: string;
        archived?: boolean;
      }>;
    }>("/crm/v3/owners/?limit=500&archived=false");
    return (response.results ?? [])
      .filter(
        (owner) =>
          Number.isInteger(owner.userId) &&
          typeof owner.email === "string" &&
          !owner.archived,
      )
      .map((owner) => {
        const email = owner.email as string;
        const name = [owner.firstName, owner.lastName]
          .filter(Boolean)
          .join(" ");
        return {
          id: String(owner.userId),
          email,
          label: name || email,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async searchCrmRecords(
    objectType: CrmObjectType,
    query: string,
  ): Promise<CrmSearchResult[]> {
    const config = crmSearchConfig[objectType];
    const response = await this.request<{ results?: SearchResult[] }>(
      `/crm/v3/objects/${objectType}/search`,
      {
        method: "POST",
        body: JSON.stringify({
          query,
          properties: config.properties,
          after: "0",
          limit: 10,
        }),
      },
    );
    return (response.results ?? []).map((record) => ({
      id: record.id,
      objectType,
      objectTypeId: config.objectTypeId,
      label: config.label(record.properties),
      secondary: config.secondary(record.properties),
    }));
  }

  async getApprovalSettings(
    objectType: string,
    ownerId: string,
  ): Promise<ApprovalSettings | null> {
    const result = await this.searchCustomRecords(objectType, {
      filters: [
        { propertyName: "record_kind", operator: "EQ", value: "norm" },
        { propertyName: "hubspot_user_id", operator: "EQ", value: ownerId },
      ],
      properties: approvalProperties,
      limit: 1,
    });
    return result[0] ? toApprovalSettings(result[0]) : null;
  }

  async saveApprovalSettings(input: {
    objectType: string;
    primaryDisplayProperty: string;
    ownerId: string;
    ownerEmail: string;
    approverId: string;
    approverEmail: string;
  }): Promise<ApprovalSettings> {
    const existing = await this.getApprovalSettings(
      input.objectType,
      input.ownerId,
    );
    const properties = {
      record_name: `Godkendelse - ${input.ownerEmail}`,
      hubspot_user_id: input.ownerId,
      hubspot_user_email: input.ownerEmail,
      approval_officer_id: input.approverId,
      approval_officer_email: input.approverEmail,
    };
    const record = existing
      ? await this.updateCustomRecord(input.objectType, existing.id, properties)
      : await this.createCustomRecord(
          input.objectType,
          input.primaryDisplayProperty,
          "norm",
          properties,
        );
    return toApprovalSettings(record);
  }

  async getWeekApproval(
    objectType: string,
    ownerId: string,
    weekKey: string,
  ): Promise<WeekApproval | null> {
    const result = await this.searchCustomRecords(objectType, {
      filters: [
        { propertyName: "record_kind", operator: "EQ", value: "week" },
        { propertyName: "hubspot_user_id", operator: "EQ", value: ownerId },
        { propertyName: "week_key", operator: "EQ", value: weekKey },
      ],
      properties: weekProperties,
      limit: 1,
    });
    return result[0] ? toWeekApproval(result[0]) : null;
  }

  async submitWeek(input: {
    objectType: string;
    primaryDisplayProperty: string;
    ownerId: string;
    ownerEmail: string;
    weekKey: string;
    totalMinutes: number;
  }): Promise<WeekApproval> {
    const settings = await this.getApprovalSettings(
      input.objectType,
      input.ownerId,
    );
    if (!settings?.approverId) {
      throw new HubSpotApiError(
        409,
        "Vælg en godkendelsesansvarlig, før ugen indsendes.",
      );
    }
    const existing = await this.getWeekApproval(
      input.objectType,
      input.ownerId,
      input.weekKey,
    );
    if (existing && ["submitted", "approved"].includes(existing.status)) {
      return existing;
    }
    const now = new Date().toISOString();
    const properties = {
      record_name: `${input.weekKey} - ${input.ownerEmail}`,
      week_key: input.weekKey,
      hubspot_user_id: input.ownerId,
      hubspot_user_email: input.ownerEmail,
      approval_officer_id: settings.approverId,
      approval_officer_email: settings.approverEmail,
      weekly_minutes: String(input.totalMinutes),
      record_status: "submitted",
      submitted_at: now,
    };
    const record = existing
      ? await this.updateCustomRecord(input.objectType, existing.id, properties)
      : await this.createCustomRecord(
          input.objectType,
          input.primaryDisplayProperty,
          "week",
          properties,
        );
    return toWeekApproval(record);
  }

  async listPendingApprovals(
    objectType: string,
    approverId: string,
  ): Promise<WeekApproval[]> {
    const records = await this.searchCustomRecords(objectType, {
      filters: [
        { propertyName: "record_kind", operator: "EQ", value: "week" },
        {
          propertyName: "approval_officer_id",
          operator: "EQ",
          value: approverId,
        },
        {
          propertyName: "record_status",
          operator: "EQ",
          value: "submitted",
        },
      ],
      properties: weekProperties,
      sorts: ["-submitted_at"],
      limit: 100,
    });
    return records.map(toWeekApproval);
  }

  async approveWeek(input: {
    objectType: string;
    weekId: string;
    approverId: string;
    approverEmail: string;
  }): Promise<WeekApproval> {
    const record = await this.getCustomRecord(
      input.objectType,
      input.weekId,
      weekProperties,
    );
    const week = toWeekApproval(record);
    if (week.approverId !== input.approverId) {
      throw new HubSpotApiError(
        403,
        "Kun den valgte godkendelsesansvarlige kan godkende ugen.",
      );
    }
    if (week.status !== "submitted") {
      throw new HubSpotApiError(409, "Kun indsendte uger kan godkendes.");
    }
    const updated = await this.updateCustomRecord(
      input.objectType,
      input.weekId,
      {
        record_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by_id: input.approverId,
        approved_by_email: input.approverEmail,
      },
    );
    return toWeekApproval({
      id: record.id,
      properties: { ...record.properties, ...updated.properties },
    });
  }

  async associate(
    fromObjectType: string,
    fromObjectId: string,
    toObjectType: string,
    toObjectId: string,
  ): Promise<void> {
    const association = await this.ensureAssociationType(
      fromObjectType,
      toObjectType,
    );
    await this.request(
      `/crm/v4/objects/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(fromObjectId)}/associations/${encodeURIComponent(toObjectType)}/${encodeURIComponent(toObjectId)}`,
      {
        method: "PUT",
        body: JSON.stringify([
          {
            associationCategory: association.category,
            associationTypeId: association.typeId,
          },
        ]),
      },
    );
  }

  private async ensureProperties(objectType: string): Promise<void> {
    const current = await this.request<{
      results?: Array<{ name?: string; groupName?: string }>;
    }>(`/crm/v3/properties/${encodeURIComponent(objectType)}`);
    const existing = new Set((current.results ?? []).map((item) => item.name));
    const groupName = (current.results ?? []).find(
      (item) => typeof item.groupName === "string",
    )?.groupName;
    for (const property of schemaProperties) {
      if (existing.has(property.name)) continue;
      await this.request(
        `/crm/v3/properties/${encodeURIComponent(objectType)}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...property,
            ...(groupName ? { groupName } : {}),
          }),
        },
      );
    }
  }

  private async ensureAssociationType(
    fromObjectType: string,
    toObjectType: string,
  ): Promise<{ category: string; typeId: number }> {
    interface AssociationLabel {
      category?: string;
      typeId?: number;
    }
    const path = `/crm/v4/associations/${encodeURIComponent(fromObjectType)}/${encodeURIComponent(toObjectType)}/labels`;
    const existing = await this.request<{ results?: AssociationLabel[] }>(path);
    const label = (existing.results ?? []).find(
      (item) =>
        typeof item.category === "string" && Number.isInteger(item.typeId),
    );
    if (label?.category && label.typeId !== undefined) {
      return { category: label.category, typeId: label.typeId };
    }

    const suffix = toObjectType.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    const created = await this.request<{
      results?: AssociationLabel[];
      category?: string;
      typeId?: number;
    }>(path, {
      method: "POST",
      body: JSON.stringify({
        name: `tidshub_to_${suffix}`,
        label: "TidsHub-post",
      }),
    });
    const createdLabel = created.results?.[0] ?? created;
    if (
      typeof createdLabel.category !== "string" ||
      !Number.isInteger(createdLabel.typeId)
    ) {
      throw new HubSpotApiError(
        502,
        "HubSpot created an association without returning its type ID.",
      );
    }
    return {
      category: createdLabel.category,
      typeId: createdLabel.typeId as number,
    };
  }

  private async createCustomRecord(
    objectType: string,
    primaryDisplayProperty: string,
    recordKind: "time_entry" | "week" | "norm",
    properties: Record<string, string>,
  ): Promise<SearchResult> {
    return this.request<SearchResult>(
      `/crm/v3/objects/${encodeURIComponent(objectType)}`,
      {
        method: "POST",
        body: JSON.stringify({
          properties: {
            ...properties,
            [primaryDisplayProperty]:
              properties[primaryDisplayProperty] ??
              properties.record_name ??
              `${recordKind} - ${properties.hubspot_user_email ?? "TidsHub"}`,
            record_kind: recordKind,
          },
        }),
      },
    );
  }

  private async updateCustomRecord(
    objectType: string,
    recordId: string,
    properties: Record<string, string>,
  ): Promise<SearchResult> {
    return this.request<SearchResult>(
      `/crm/v3/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`,
      { method: "PATCH", body: JSON.stringify({ properties }) },
    );
  }

  private async getMutableEntry(
    objectType: string,
    entryId: string,
    ownerId: string,
  ): Promise<SearchResult> {
    const record = await this.getCustomRecord(
      objectType,
      entryId,
      entryProperties,
    );
    if (
      record.properties.record_kind !== "time_entry" ||
      record.properties.hubspot_owner_id !== ownerId
    ) {
      throw new HubSpotApiError(
        403,
        "Du kan kun ændre dine egne tidsregistreringer.",
      );
    }
    const week = await this.getWeekApproval(
      objectType,
      ownerId,
      record.properties.week_key ?? "",
    );
    if (week && ["submitted", "approved"].includes(week.status)) {
      throw new HubSpotApiError(409, "Ugen er indsendt og kan ikke ændres.");
    }
    return record;
  }

  private async getCustomRecord(
    objectType: string,
    recordId: string,
    properties: readonly string[],
  ): Promise<SearchResult> {
    const query = new URLSearchParams({ properties: properties.join(",") });
    return this.request<SearchResult>(
      `/crm/v3/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}?${query}`,
    );
  }

  private async searchCustomRecords(
    objectType: string,
    input: {
      filters: Array<Record<string, string>>;
      properties: readonly string[];
      sorts?: string[];
      limit: number;
    },
  ): Promise<SearchResult[]> {
    const result = await this.request<{ results?: SearchResult[] }>(
      `/crm/v3/objects/${encodeURIComponent(objectType)}/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [{ filters: input.filters }],
          properties: input.properties,
          sorts: input.sorts ?? [],
          after: "0",
          limit: input.limit,
        }),
      },
    );
    return result.results ?? [];
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.fetcher(`https://api.hubapi.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
    const responseText = await response.text();
    const body = responseText
      ? (JSON.parse(responseText) as T & { message?: string })
      : ({} as T & { message?: string });
    if (!response.ok) {
      console.error("HubSpot API request failed", {
        path,
        status: response.status,
        body,
      });
      throw new HubSpotApiError(
        response.status,
        body.message ?? `HubSpot API failed with ${response.status}.`,
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

const entryProperties = [
  "record_kind",
  "week_key",
  "entry_date",
  "duration_minutes",
  "category",
  "description",
  "billable",
  "hourly_rate",
  "record_status",
  "hubspot_owner_id",
  "associated_object_type",
  "associated_object_id",
  "associated_object_label",
] as const;

const approvalProperties = [
  "record_kind",
  "hubspot_user_id",
  "hubspot_user_email",
  "approval_officer_id",
  "approval_officer_email",
] as const;

const weekProperties = [
  "record_kind",
  "week_key",
  "hubspot_user_id",
  "hubspot_user_email",
  "approval_officer_id",
  "approval_officer_email",
  "record_status",
  "weekly_minutes",
  "submitted_at",
  "approved_at",
  "approved_by_id",
  "approved_by_email",
] as const;

const schemaProperties = [
  property("record_name", "Navn", "string", "text"),
  enumeration("record_kind", "Posttype", [
    ["Tidsregistrering", "time_entry"],
    ["Uge", "week"],
    ["Arbejdsnorm", "norm"],
  ]),
  property("week_key", "Ugenøgle", "string", "text"),
  property("entry_date", "Dato", "date", "date"),
  property("duration_minutes", "Varighed i minutter", "number", "number"),
  enumeration("category", "Kategori", [
    ["Projektarbejde", "project"],
    ["Internt arbejde", "internal"],
    ["Møde", "meeting"],
    ["Pause", "break"],
    ["Fravær", "absence"],
  ]),
  property("description", "Beskrivelse", "string", "textarea"),
  booleanProperty("billable", "Fakturerbar"),
  property("hourly_rate", "Timepris", "number", "number"),
  property("weekly_minutes", "Ugentlige minutter", "number", "number"),
  property("monday_minutes", "Mandag i minutter", "number", "number"),
  property("tuesday_minutes", "Tirsdag i minutter", "number", "number"),
  property("wednesday_minutes", "Onsdag i minutter", "number", "number"),
  property("thursday_minutes", "Torsdag i minutter", "number", "number"),
  property("friday_minutes", "Fredag i minutter", "number", "number"),
  property("saturday_minutes", "Lørdag i minutter", "number", "number"),
  property("sunday_minutes", "Søndag i minutter", "number", "number"),
  enumeration("record_status", "Status", [
    ["Kladde", "draft"],
    ["Indsendt", "submitted"],
    ["Godkendt", "approved"],
    ["Afvist", "rejected"],
    ["Låst", "locked"],
  ]),
  property("hubspot_user_id", "HubSpot-bruger-ID", "string", "text"),
  property("hubspot_user_email", "HubSpot-bruger-e-mail", "string", "text"),
  property("associated_object_type", "Tilknyttet objekttype", "string", "text"),
  property("associated_object_id", "Tilknyttet objekt-ID", "string", "text"),
  property("associated_object_label", "Tilknyttet CRM-post", "string", "text"),
  property("approval_officer_id", "Godkender-ID", "string", "text"),
  property("approval_officer_email", "Godkender-e-mail", "string", "text"),
  property("approved_by_id", "Godkendt af ID", "string", "text"),
  property("approved_by_email", "Godkendt af e-mail", "string", "text"),
  property("submitted_at", "Indsendt tidspunkt", "datetime", "date"),
  property("approved_at", "Godkendt tidspunkt", "datetime", "date"),
  property("manager_comment", "Leders kommentar", "string", "textarea"),
] as const;

const schemaDefinition = {
  name: "tidshub_record",
  labels: { singular: "TidsHub-post", plural: "TidsHub-poster" },
  primaryDisplayProperty: "record_name",
  associatedObjects: ["CONTACT", "COMPANY", "DEAL", "TICKET"],
  properties: schemaProperties,
};

function property(
  name: string,
  label: string,
  type: string,
  fieldType: string,
) {
  return { name, label, type, fieldType };
}

function enumeration(
  name: string,
  label: string,
  options: Array<[string, string]>,
) {
  return {
    ...property(name, label, "enumeration", "select"),
    options: options.map(([optionLabel, value], displayOrder) => ({
      label: optionLabel,
      value,
      displayOrder,
      hidden: false,
    })),
  };
}

function booleanProperty(name: string, label: string) {
  return {
    ...property(name, label, "bool", "booleancheckbox"),
    options: [
      {
        label: "Ja",
        value: "true",
        displayOrder: 0,
        hidden: false,
      },
      {
        label: "Nej",
        value: "false",
        displayOrder: 1,
        hidden: false,
      },
    ],
  };
}

function normalizeSchema(schema: Record<string, unknown>): TidsHubSchema {
  if (
    typeof schema.objectTypeId !== "string" ||
    typeof schema.fullyQualifiedName !== "string" ||
    typeof schema.primaryDisplayProperty !== "string"
  ) {
    throw new HubSpotApiError(
      502,
      "HubSpot returned an incomplete object schema.",
    );
  }
  return {
    objectTypeId: schema.objectTypeId,
    fullyQualifiedName: schema.fullyQualifiedName,
    primaryDisplayProperty: schema.primaryDisplayProperty,
  };
}

const crmSearchConfig: Record<
  CrmObjectType,
  {
    objectTypeId: string;
    properties: string[];
    label: (properties: Record<string, string | null>) => string;
    secondary: (properties: Record<string, string | null>) => string;
  }
> = {
  contacts: {
    objectTypeId: "0-1",
    properties: ["firstname", "lastname", "email", "company"],
    label: (properties) =>
      [properties.firstname, properties.lastname].filter(Boolean).join(" ") ||
      value(properties.email, "Kontakt"),
    secondary: (properties) =>
      [properties.email, properties.company].filter(Boolean).join(" | "),
  },
  companies: {
    objectTypeId: "0-2",
    properties: ["name", "domain", "city"],
    label: (properties) => value(properties.name, "Virksomhed"),
    secondary: (properties) =>
      [properties.domain, properties.city].filter(Boolean).join(" | "),
  },
  deals: {
    objectTypeId: "0-3",
    properties: ["dealname", "dealstage", "amount"],
    label: (properties) => value(properties.dealname, "Deal"),
    secondary: (properties) =>
      [properties.dealstage, properties.amount].filter(Boolean).join(" | "),
  },
  tickets: {
    objectTypeId: "0-5",
    properties: ["subject", "hs_ticket_priority", "hs_pipeline_stage"],
    label: (properties) => value(properties.subject, "Ticket"),
    secondary: (properties) =>
      [properties.hs_ticket_priority, properties.hs_pipeline_stage]
        .filter(Boolean)
        .join(" | "),
  },
};

function toApprovalSettings(record: SearchResult): ApprovalSettings {
  return {
    id: record.id,
    ownerId: value(record.properties.hubspot_user_id),
    ownerEmail: value(record.properties.hubspot_user_email),
    approverId: value(record.properties.approval_officer_id),
    approverEmail: value(record.properties.approval_officer_email),
  };
}

function toWeekApproval(record: SearchResult): WeekApproval {
  return {
    id: record.id,
    weekKey: value(record.properties.week_key),
    ownerId: value(record.properties.hubspot_user_id),
    ownerEmail: value(record.properties.hubspot_user_email),
    approverId: value(record.properties.approval_officer_id),
    approverEmail: value(record.properties.approval_officer_email),
    status: value(record.properties.record_status, "draft"),
    totalMinutes: Number(record.properties.weekly_minutes ?? 0),
    submittedAt: record.properties.submitted_at ?? null,
    approvedAt: record.properties.approved_at ?? null,
    approvedByEmail: record.properties.approved_by_email ?? null,
  };
}

function value(input: string | null | undefined, fallback = ""): string {
  return input?.trim() || fallback;
}

function searchDateValue(date: string): string {
  return String(Date.parse(`${date}T00:00:00.000Z`));
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
