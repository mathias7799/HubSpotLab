import { HttpError, type RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

export interface HandoffSettings {
  enabled: boolean;
  requiredProperties: string[];
  requireCompany: boolean;
  requireContact: boolean;
  ticketPipelineId: string;
  ticketStageId: string;
  ticketSubjectPrefix: string;
}

export interface HandoffItem {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface HandoffReadiness {
  dealId: string;
  dealName: string;
  configurationReady: boolean;
  prerequisitesReady: boolean;
  complete: boolean;
  ticketId?: string;
  items: HandoffItem[];
}

export interface TicketPipeline {
  id: string;
  label: string;
  stages: Array<{ id: string; label: string; displayOrder: number }>;
}

export interface DealProperty {
  name: string;
  label: string;
}

const handoffSubjectMarker = "HandoffReady - ";

export const defaultHandoffSettings: HandoffSettings = {
  enabled: true,
  requiredProperties: ["dealname", "amount", "closedate"],
  requireCompany: true,
  requireContact: true,
  ticketPipelineId: "",
  ticketStageId: "",
  ticketSubjectPrefix: "Customer handoff",
};

export async function getHandoffSettings(
  context: RuntimeApiContext,
  portalId: number,
): Promise<HandoffSettings> {
  const stored = await context.configuration.get(portalId, "handoff.settings");
  return stored ? parseHandoffSettings(stored) : defaultHandoffSettings;
}

export async function createHandoffTicket(
  context: RuntimeApiContext,
  portalId: number,
  dealId: string,
  settings: HandoffSettings,
): Promise<HandoffReadiness> {
  const key = `handoff-ticket:${portalId}:${dealId}`;
  if (!(await context.idempotency.claim(key, 120))) {
    throw new HttpError(
      409,
      "Handoff ticket creation is already in progress. Refresh readiness before trying again.",
    );
  }
  try {
    const token = await context.accessTokenForPortal(portalId);
    return await new HandoffService(token, context.fetcher).createTicket(
      dealId,
      settings,
    );
  } catch (cause) {
    await context.idempotency.release(key);
    throw cause;
  }
}

export function parseHandoffSettings(value: unknown): HandoffSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Handoff settings must be an object.");
  }
  const body = value as Record<string, unknown>;
  const requiredProperties = body.requiredProperties;
  if (
    !Array.isArray(requiredProperties) ||
    requiredProperties.length > 20 ||
    requiredProperties.some(
      (item) =>
        typeof item !== "string" ||
        !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(item.trim()),
    )
  ) {
    throw new HttpError(
      400,
      "Required deal properties must contain at most 20 internal property names.",
    );
  }
  const prefix = requiredString(
    body.ticketSubjectPrefix,
    "ticketSubjectPrefix",
  );
  if (prefix.length > 80) {
    throw new HttpError(
      400,
      "Ticket subject prefix must be 80 characters or fewer.",
    );
  }
  return {
    enabled: requiredBoolean(body.enabled, "enabled"),
    requiredProperties: [
      ...new Set(requiredProperties.map((item) => item.trim())),
    ],
    requireCompany: requiredBoolean(body.requireCompany, "requireCompany"),
    requireContact: requiredBoolean(body.requireContact, "requireContact"),
    ticketPipelineId: optionalString(body.ticketPipelineId, "ticketPipelineId"),
    ticketStageId: optionalString(body.ticketStageId, "ticketStageId"),
    ticketSubjectPrefix: prefix,
  };
}

export class HandoffService {
  private dealPropertiesPromise?: Promise<DealProperty[]>;

  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async evaluate(
    dealId: string,
    settings: HandoffSettings,
  ): Promise<HandoffReadiness> {
    const [deal, properties] = await Promise.all([
      this.getDeal(dealId, settings),
      this.dealProperties(),
    ]);
    return readiness(deal, settings, propertyLabels(properties));
  }

  async list(settings: HandoffSettings): Promise<HandoffReadiness[]> {
    const response = await this.request<{ results?: Array<{ id?: string }> }>(
      "/crm/v3/objects/deals/search",
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "hs_is_closed_won",
                  operator: "EQ",
                  value: "true",
                },
              ],
            },
          ],
          properties: ["dealname"],
          sorts: ["-hs_lastmodifieddate"],
          limit: 10,
        }),
      },
    );
    const dealIds = (response.results ?? [])
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));
    return mapConcurrent(dealIds, 3, (dealId) =>
      this.evaluate(dealId, settings),
    );
  }

  async dealProperties(): Promise<DealProperty[]> {
    this.dealPropertiesPromise ??= this.request<{
      results?: Array<{ name?: string; label?: string; hidden?: boolean }>;
    }>("/crm/v3/properties/deals?archived=false").then((response) =>
      (response.results ?? [])
        .filter(
          (property) =>
            property.hidden !== true && property.name && property.label,
        )
        .map((property) => ({
          name: property.name as string,
          label: property.label as string,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    );
    return this.dealPropertiesPromise;
  }

  async ticketPipelines(): Promise<TicketPipeline[]> {
    const response = await this.request<{
      results?: Array<{
        id?: string;
        label?: string;
        stages?: Array<{ id?: string; label?: string; displayOrder?: number }>;
      }>;
    }>("/crm/v3/pipelines/tickets");
    return (response.results ?? []).flatMap((pipeline) =>
      pipeline.id && pipeline.label
        ? [
            {
              id: pipeline.id,
              label: pipeline.label,
              stages: (pipeline.stages ?? []).flatMap((stage) =>
                stage.id && stage.label
                  ? [
                      {
                        id: stage.id,
                        label: stage.label,
                        displayOrder: stage.displayOrder ?? 0,
                      },
                    ]
                  : [],
              ),
            },
          ]
        : [],
    );
  }

  async validateSettings(settings: HandoffSettings): Promise<void> {
    const [properties, pipelines] = await Promise.all([
      this.dealProperties(),
      this.ticketPipelines(),
    ]);
    const propertyNames = new Set(properties.map((property) => property.name));
    const unknown = settings.requiredProperties.filter(
      (property) => !propertyNames.has(property),
    );
    if (unknown.length) {
      throw new HttpError(
        400,
        `Unknown deal properties: ${unknown.join(", ")}. Refresh settings and choose current HubSpot properties.`,
      );
    }
    if (!settings.ticketPipelineId && !settings.ticketStageId) return;
    const pipeline = pipelines.find(
      (item) => item.id === settings.ticketPipelineId,
    );
    if (!pipeline) {
      throw new HttpError(
        400,
        "The selected ticket pipeline no longer exists. Refresh settings and choose another pipeline.",
      );
    }
    if (!pipeline.stages.some((stage) => stage.id === settings.ticketStageId)) {
      throw new HttpError(
        400,
        "The selected ticket stage does not belong to the configured pipeline.",
      );
    }
  }

  async createTicket(
    dealId: string,
    settings: HandoffSettings,
  ): Promise<HandoffReadiness> {
    if (!settings.enabled) {
      throw new HttpError(409, "HandoffReady is disabled for this portal.");
    }
    if (!settings.ticketPipelineId || !settings.ticketStageId) {
      throw new HttpError(
        409,
        "Configure a ticket pipeline and stage before creating handoff tickets.",
      );
    }
    const [deal, properties] = await Promise.all([
      this.getDeal(dealId, settings),
      this.dealProperties(),
    ]);
    const current = readiness(deal, settings, propertyLabels(properties));
    if (!current.prerequisitesReady) {
      throw new HttpError(
        409,
        "Complete the required deal fields and associations before creating the handoff ticket.",
      );
    }
    if (current.ticketId) return current;

    const ticket = await this.request<{ id: string }>(
      "/crm/v3/objects/tickets",
      {
        method: "POST",
        body: JSON.stringify({
          properties: {
            subject: `${handoffSubjectMarker}${settings.ticketSubjectPrefix}: ${deal.properties.dealname || dealId}`,
            hs_pipeline: settings.ticketPipelineId,
            hs_pipeline_stage: settings.ticketStageId,
          },
        }),
      },
    );
    try {
      const label = await this.defaultAssociation("tickets", "deals");
      await this.request(
        `/crm/v4/objects/tickets/${encodeURIComponent(ticket.id)}/associations/deals/${encodeURIComponent(dealId)}`,
        {
          method: "PUT",
          body: JSON.stringify([
            {
              associationCategory: label.category,
              associationTypeId: label.typeId,
            },
          ]),
        },
      );
    } catch (cause) {
      try {
        await this.request(
          `/crm/v3/objects/tickets/${encodeURIComponent(ticket.id)}`,
          {
            method: "DELETE",
          },
        );
      } catch (cleanupCause) {
        console.error("HandoffReady ticket association rollback failed", {
          dealId,
          ticketId: ticket.id,
          cause,
          cleanupCause,
        });
        throw new HttpError(
          502,
          `Ticket ${ticket.id} was created but could not be associated or removed. Clean it up manually before retrying.`,
        );
      }
      throw cause;
    }
    return {
      ...current,
      complete: true,
      ticketId: ticket.id,
      items: current.items.map((item) =>
        item.key === "ticket"
          ? {
              ...item,
              passed: true,
              detail: `Handoff ticket ${ticket.id} is associated with this deal.`,
            }
          : item,
      ),
    };
  }

  private async getDeal(
    dealId: string,
    settings: HandoffSettings,
  ): Promise<DealRecord> {
    const properties = [
      ...new Set([
        "dealname",
        "hs_is_closed_won",
        ...settings.requiredProperties,
      ]),
    ];
    const query = new URLSearchParams({
      properties: properties.join(","),
      associations: "companies,contacts",
      archived: "false",
    });
    const [deal, handoffTicketId] = await Promise.all([
      this.request<DealRecord>(
        `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?${query}`,
      ),
      this.findHandoffTicket(dealId),
    ]);
    return { ...deal, ...(handoffTicketId ? { handoffTicketId } : {}) };
  }

  private async findHandoffTicket(dealId: string): Promise<string | undefined> {
    const associations = await this.request<{
      results?: Array<{ toObjectId?: number | string }>;
    }>(
      `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/tickets?limit=100`,
    );
    const ids = (associations.results ?? [])
      .map((item) => item.toObjectId)
      .filter(
        (id): id is number | string =>
          typeof id === "string" || typeof id === "number",
      )
      .map(String);
    if (!ids.length) return undefined;
    const tickets = await this.request<{
      results?: Array<{
        id?: string;
        properties?: { subject?: string | null };
      }>;
    }>("/crm/v3/objects/tickets/batch/read", {
      method: "POST",
      body: JSON.stringify({
        properties: ["subject"],
        inputs: ids.map((id) => ({ id })),
      }),
    });
    return tickets.results?.find((ticket) =>
      ticket.properties?.subject?.startsWith(handoffSubjectMarker),
    )?.id;
  }

  private async defaultAssociation(
    from: string,
    to: string,
  ): Promise<{ category: string; typeId: number }> {
    const response = await this.request<{
      results?: Array<{
        category?: string;
        typeId?: number;
        label?: string | null;
      }>;
    }>(`/crm/v4/associations/${from}/${to}/labels`);
    const label = response.results?.find(
      (item) =>
        item.category === "HUBSPOT_DEFINED" &&
        item.label == null &&
        Number.isInteger(item.typeId),
    );
    if (!label?.category || label.typeId === undefined) {
      throw new HttpError(
        502,
        "HubSpot did not return a default ticket-to-deal association.",
      );
    }
    return { category: label.category, typeId: label.typeId };
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    headers.set("Content-Type", "application/json");
    const signal = init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000);
    const response = await this.fetcher(`https://api.hubapi.com${path}`, {
      ...init,
      headers,
      signal,
    });
    const text = await response.text();
    const body = text
      ? (JSON.parse(text) as T & { message?: string })
      : ({} as T);
    if (!response.ok) {
      throw new HttpError(
        response.status,
        (body as { message?: string }).message ??
          `HubSpot API failed with ${response.status}.`,
      );
    }
    return body;
  }
}

interface DealRecord {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<string, { results?: Array<{ id?: string }> }>;
  handoffTicketId?: string;
}

function readiness(
  deal: DealRecord,
  settings: HandoffSettings,
  labels: Map<string, string>,
): HandoffReadiness {
  const closedWon = deal.properties.hs_is_closed_won === "true";
  const items: HandoffItem[] = [
    {
      key: "closed-won",
      label: "Closed-won deal",
      passed: closedWon,
      detail: closedWon
        ? "This deal is closed won and can be handed to service."
        : "Move this deal to a closed-won stage before creating the service handoff.",
    },
    ...settings.requiredProperties.map((propertyName) => {
      const passed = hasValue(deal.properties[propertyName]);
      const label = labels.get(propertyName) ?? propertyName;
      return {
        key: `property:${propertyName}`,
        label,
        passed,
        detail: passed
          ? `${label} is complete.`
          : `${label} is required before handoff.`,
      };
    }),
  ];
  if (settings.requireCompany) {
    const count = associationIds(deal, "companies").length;
    items.push({
      key: "company",
      label: "Associated company",
      passed: count > 0,
      detail:
        count > 0
          ? `${count} company record(s) associated.`
          : "Associate a company with this deal.",
    });
  }
  if (settings.requireContact) {
    const count = associationIds(deal, "contacts").length;
    items.push({
      key: "contact",
      label: "Associated contact",
      passed: count > 0,
      detail:
        count > 0
          ? `${count} contact record(s) associated.`
          : "Associate a contact with this deal.",
    });
  }
  const ticketId = deal.handoffTicketId;
  items.push({
    key: "ticket",
    label: "Service handoff ticket",
    passed: Boolean(ticketId),
    detail: ticketId
      ? `HandoffReady ticket ${ticketId} is associated with this deal.`
      : "Create the service ticket when the handoff details are ready.",
  });
  const prerequisitesReady = items
    .filter((item) => item.key !== "ticket")
    .every((item) => item.passed);
  return {
    dealId: deal.id,
    dealName: deal.properties.dealname || `Deal ${deal.id}`,
    configurationReady: Boolean(
      settings.ticketPipelineId && settings.ticketStageId,
    ),
    prerequisitesReady,
    complete: prerequisitesReady && Boolean(ticketId),
    ...(ticketId ? { ticketId } : {}),
    items,
  };
}

function propertyLabels(properties: DealProperty[]): Map<string, string> {
  return new Map(properties.map((property) => [property.name, property.label]));
}

async function mapConcurrent<Input, Output>(
  values: Input[],
  concurrency: number,
  mapper: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(values.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < values.length) {
      const index = next++;
      results[index] = await mapper(values[index] as Input);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      worker(),
    ),
  );
  return results;
}

function associationIds(deal: DealRecord, name: string): string[] {
  return (deal.associations?.[name]?.results ?? [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));
}

function hasValue(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean")
    throw new HttpError(400, `${name} must be boolean.`);
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown, name: string): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string")
    throw new HttpError(400, `${name} must be a string.`);
  return value.trim();
}
