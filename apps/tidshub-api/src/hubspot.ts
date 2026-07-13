export interface TidsHubSchema {
  objectTypeId: string;
  fullyQualifiedName: string;
  primaryDisplayProperty: string;
}

interface SearchResult {
  id: string;
  properties: Record<string, string | null>;
}

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
    return this.request<SearchResult>(
      `/crm/v3/objects/${encodeURIComponent(objectType)}`,
      {
        method: "POST",
        body: JSON.stringify({
          properties: {
            ...properties,
            [primaryDisplayProperty]:
              properties[primaryDisplayProperty] ??
              `${properties.entry_date ?? "Tid"} - ${properties.description ?? "Tidsregistrering"}`,
            record_kind: "time_entry",
          },
        }),
      },
    );
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
  enumeration("record_status", "Status", [
    ["Kladde", "draft"],
    ["Indsendt", "submitted"],
    ["Godkendt", "approved"],
    ["Afvist", "rejected"],
    ["Låst", "locked"],
  ]),
  property("hubspot_user_id", "HubSpot-bruger-ID", "string", "text"),
  property("hubspot_user_email", "HubSpot-bruger-e-mail", "string", "text"),
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

function searchDateValue(date: string): string {
  return String(Date.parse(`${date}T00:00:00.000Z`));
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
