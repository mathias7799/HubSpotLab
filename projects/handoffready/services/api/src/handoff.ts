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
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async evaluate(
    dealId: string,
    settings: HandoffSettings,
  ): Promise<HandoffReadiness> {
    const deal = await this.getDeal(dealId, settings.requiredProperties);
    return readiness(deal, settings);
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
    const results: HandoffReadiness[] = [];
    for (const item of response.results ?? []) {
      if (item.id) results.push(await this.evaluate(item.id, settings));
    }
    return results;
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
    const deal = await this.getDeal(dealId, settings.requiredProperties);
    const current = readiness(deal, settings);
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
            subject: `${settings.ticketSubjectPrefix}: ${deal.properties.dealname || dealId}`,
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
    requiredProperties: string[],
  ): Promise<DealRecord> {
    const properties = [...new Set(["dealname", ...requiredProperties])];
    const query = new URLSearchParams({
      properties: properties.join(","),
      associations: "companies,contacts,tickets",
      archived: "false",
    });
    return this.request(
      `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?${query}`,
    );
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
    const response = await this.fetcher(`https://api.hubapi.com${path}`, {
      ...init,
      headers,
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
}

function readiness(
  deal: DealRecord,
  settings: HandoffSettings,
): HandoffReadiness {
  const items: HandoffItem[] = settings.requiredProperties.map(
    (propertyName) => {
      const passed = hasValue(deal.properties[propertyName]);
      return {
        key: `property:${propertyName}`,
        label: propertyName,
        passed,
        detail: passed
          ? "This deal field is complete."
          : `Deal property ${propertyName} is required before handoff.`,
      };
    },
  );
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
  const ticketIds = associationIds(deal, "tickets");
  items.push({
    key: "ticket",
    label: "Service handoff ticket",
    passed: ticketIds.length > 0,
    detail:
      ticketIds.length > 0
        ? `Ticket ${ticketIds[0]} is associated with this deal.`
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
    complete: prerequisitesReady && ticketIds.length > 0,
    ...(ticketIds[0] ? { ticketId: ticketIds[0] } : {}),
    items,
  };
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
