import { HttpError, type RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

export interface HandoffSettings {
  enabled: boolean;
  requiredProperties: string[];
  requireCompany: boolean;
  requireContact: boolean;
  ticketPipelineId: string;
  ticketStageId: string;
  ticketSubjectPrefix: string;
  ticketOwnerId: string;
  routes: HandoffRoute[];
}

export type HandoffOutputType = "ticket" | "task" | "project_tasks";

export interface HandoffRoute {
  id: string;
  name: string;
  department: string;
  outputType: HandoffOutputType;
  requiredProperties: string[];
  requireCompany: boolean;
  requireContact: boolean;
  pipelineId: string;
  stageId: string;
  subjectPrefix: string;
  ownerId: string;
  taskTemplates: HandoffTaskTemplate[];
}

export interface HandoffTaskTemplate {
  id: string;
  name: string;
  description: string;
  status: "NOT_STARTED" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueInDays: number;
  taskType: "TODO" | "CALL" | "EMAIL";
  reminderMinutesBefore: number;
  assignmentType: "none" | "owner" | "queue";
  assigneeId: string;
  queuePropertyName: string;
}

export interface TaskAssigneeOption {
  id: string;
  label: string;
  propertyName?: string;
}

export interface TaskAssigneeCatalog {
  owners: TaskAssigneeOption[];
  queues: TaskAssigneeOption[];
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
  routeId: string;
  routeName: string;
  department: string;
  outputType: HandoffOutputType;
  outputIds: string[];
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
  ticketOwnerId: "",
  routes: [
    {
      id: "customer-success",
      name: "Customer success handoff",
      department: "Customer Success",
      outputType: "ticket",
      requiredProperties: ["dealname", "amount", "closedate"],
      requireCompany: true,
      requireContact: true,
      pipelineId: "",
      stageId: "",
      subjectPrefix: "Customer handoff",
      ownerId: "",
      taskTemplates: [],
    },
  ],
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
    const trackedTicketId = await trackedTicketForDeal(
      context,
      portalId,
      dealId,
    );
    const result = await new HandoffService(
      token,
      context.fetcher,
    ).createTicket(dealId, settings, trackedTicketId);
    if (result.ticketId && result.ticketId !== trackedTicketId) {
      try {
        await rememberHandoffTicket(context, portalId, dealId, result.ticketId);
      } catch (cause) {
        console.error("HandoffReady ticket tracking write failed", {
          portalId,
          dealId,
          ticketId: result.ticketId,
          cause,
        });
        throw new HttpError(
          502,
          `Ticket ${result.ticketId} was created and associated, but HandoffReady could not save its tracking record. Refresh readiness before retrying.`,
        );
      }
    }
    return result;
  } catch (cause) {
    await context.idempotency.release(key);
    throw cause;
  }
}

interface StoredHandoffOutput {
  outputType: HandoffOutputType;
  ids: string[];
}

export async function createConfiguredHandoff(
  context: RuntimeApiContext,
  portalId: number,
  dealId: string,
  settings: HandoffSettings,
  routeId: string,
): Promise<HandoffReadiness> {
  if (!settings.enabled)
    throw new HttpError(409, "HandoffReady is disabled for this portal.");
  const route = configuredRoute(settings, routeId);
  const key = `handoff-output:${portalId}:${route.id}:${dealId}`;
  if (!(await context.idempotency.claim(key, 120))) {
    throw new HttpError(
      409,
      "This handoff is already being created. Refresh before trying again.",
    );
  }
  try {
    const stored = await trackedOutput(context, portalId, dealId, route);
    const result = await new HandoffService(
      await context.accessTokenForPortal(portalId),
      context.fetcher,
    ).createRoute(dealId, route, stored?.ids ?? []);
    if (result.outputIds.length && !stored) {
      await context.configuration.put(
        portalId,
        handoffOutputStorageKey(dealId, route.id),
        { outputType: route.outputType, ids: result.outputIds },
      );
    }
    return result;
  } catch (cause) {
    await context.idempotency.release(key);
    throw cause;
  }
}

export async function evaluateConfiguredHandoff(
  context: RuntimeApiContext,
  portalId: number,
  dealId: string,
  settings: HandoffSettings,
  routeId: string,
): Promise<HandoffReadiness> {
  const route = configuredRoute(settings, routeId);
  const stored = await trackedOutput(context, portalId, dealId, route);
  return new HandoffService(
    await context.accessTokenForPortal(portalId),
    context.fetcher,
  ).evaluateRoute(dealId, route, stored?.ids ?? []);
}

export async function evaluateHandoff(
  context: RuntimeApiContext,
  portalId: number,
  dealId: string,
  settings: HandoffSettings,
): Promise<HandoffReadiness> {
  const trackedTicketId = await trackedTicketForDeal(context, portalId, dealId);
  const result = await new HandoffService(
    await context.accessTokenForPortal(portalId),
    context.fetcher,
  ).evaluate(dealId, settings, trackedTicketId);
  if (result.ticketId && result.ticketId !== trackedTicketId) {
    try {
      await rememberHandoffTicket(context, portalId, dealId, result.ticketId);
    } catch (cause) {
      console.error("HandoffReady ticket tracking repair failed", {
        portalId,
        dealId,
        ticketId: result.ticketId,
        cause,
      });
    }
  }
  return result;
}

export async function listHandoffs(
  context: RuntimeApiContext,
  portalId: number,
  settings: HandoffSettings,
  routeId?: string,
): Promise<HandoffReadiness[]> {
  const service = new HandoffService(
    await context.accessTokenForPortal(portalId),
    context.fetcher,
  );
  const route = routeId
    ? configuredRoute(settings, routeId)
    : (settings.routes[0] as HandoffRoute);
  return service.listRoute(
    route,
    async (dealId) =>
      (await trackedOutput(context, portalId, dealId, route))?.ids ?? [],
  );
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
  const legacy = {
    enabled: requiredBoolean(body.enabled, "enabled"),
    requiredProperties: [
      ...new Set(requiredProperties.map((item) => item.trim())),
    ],
    requireCompany: requiredBoolean(body.requireCompany, "requireCompany"),
    requireContact: requiredBoolean(body.requireContact, "requireContact"),
    ticketPipelineId: optionalString(body.ticketPipelineId, "ticketPipelineId"),
    ticketStageId: optionalString(body.ticketStageId, "ticketStageId"),
    ticketSubjectPrefix: prefix,
    ticketOwnerId: optionalString(body.ticketOwnerId, "ticketOwnerId"),
  };
  const routes =
    body.routes === undefined
      ? [
          {
            id: "customer-success",
            name: "Customer success handoff",
            department: "Customer Success",
            outputType: "ticket" as const,
            requiredProperties: legacy.requiredProperties,
            requireCompany: legacy.requireCompany,
            requireContact: legacy.requireContact,
            pipelineId: legacy.ticketPipelineId,
            stageId: legacy.ticketStageId,
            subjectPrefix: legacy.ticketSubjectPrefix,
            ownerId: legacy.ticketOwnerId,
            taskTemplates: [],
          },
        ]
      : parseRoutes(body.routes);
  if (new TextEncoder().encode(JSON.stringify(routes)).length > 40_000) {
    throw new HttpError(
      400,
      "Handoff routes are too large. Shorten task descriptions or remove unused templates.",
    );
  }
  const primary = routes[0] as HandoffRoute;
  return {
    ...legacy,
    requiredProperties: primary.requiredProperties,
    requireCompany: primary.requireCompany,
    requireContact: primary.requireContact,
    ticketPipelineId: primary.outputType === "ticket" ? primary.pipelineId : "",
    ticketStageId: primary.outputType === "ticket" ? primary.stageId : "",
    ticketSubjectPrefix: primary.subjectPrefix,
    ticketOwnerId: primary.ownerId,
    routes,
  };
}

function parseRoutes(value: unknown): HandoffRoute[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw new HttpError(400, "Configure between 1 and 12 handoff routes.");
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new HttpError(400, `Handoff route ${index + 1} must be an object.`);
    }
    const route = item as Record<string, unknown>;
    const id = requiredString(route.id, "route id").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || ids.has(id)) {
      throw new HttpError(
        400,
        "Handoff route IDs must be unique URL-safe names.",
      );
    }
    ids.add(id);
    const outputType = route.outputType;
    if (
      !(["ticket", "task", "project_tasks"] as unknown[]).includes(outputType)
    ) {
      throw new HttpError(
        400,
        `Handoff route ${id} has an invalid output type.`,
      );
    }
    const requiredProperties = route.requiredProperties;
    if (
      !Array.isArray(requiredProperties) ||
      requiredProperties.length > 20 ||
      requiredProperties.some(
        (property) =>
          typeof property !== "string" ||
          !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(property.trim()),
      )
    ) {
      throw new HttpError(
        400,
        `Handoff route ${id} has invalid required properties.`,
      );
    }
    const taskTemplates = parseTaskTemplates(route.taskTemplates ?? [], id);
    if (
      ["task", "project_tasks"].includes(String(outputType)) &&
      taskTemplates.length === 0
    ) {
      throw new HttpError(
        400,
        `${outputType === "task" ? "Task" : "Project"} route ${id} needs at least one task template.`,
      );
    }
    return {
      id,
      name: limitedString(route.name, "route name", 80),
      department: limitedString(route.department, "department", 80),
      outputType: outputType as HandoffOutputType,
      requiredProperties: [
        ...new Set(
          requiredProperties.map((property) => String(property).trim()),
        ),
      ],
      requireCompany: requiredBoolean(route.requireCompany, "requireCompany"),
      requireContact: requiredBoolean(route.requireContact, "requireContact"),
      pipelineId: optionalString(route.pipelineId, "pipelineId"),
      stageId: optionalString(route.stageId, "stageId"),
      subjectPrefix: limitedString(route.subjectPrefix, "subjectPrefix", 80),
      ownerId: optionalString(route.ownerId, "route owner ID"),
      taskTemplates,
    };
  });
}

function parseTaskTemplates(
  value: unknown,
  routeId: string,
): HandoffTaskTemplate[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new HttpError(
      400,
      `Handoff route ${routeId} must contain at most 20 task templates.`,
    );
  }
  const ids = new Set<string>();
  return value.map((item, index) => {
    const template =
      typeof item === "string"
        ? {
            id: `task-${index + 1}`,
            name: item,
            description: "",
            status: "NOT_STARTED",
            priority: "MEDIUM",
            dueInDays: index + 1,
            taskType: "TODO",
            reminderMinutesBefore: 0,
            assignmentType: "none",
            assigneeId: "",
            queuePropertyName: "",
          }
        : item;
    if (
      typeof template !== "object" ||
      template === null ||
      Array.isArray(template)
    ) {
      throw new HttpError(
        400,
        `Task template ${index + 1} in ${routeId} must be an object.`,
      );
    }
    const record = template as Record<string, unknown>;
    const id = requiredString(record.id, "task template id").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || ids.has(id)) {
      throw new HttpError(
        400,
        `Task template IDs in ${routeId} must be unique URL-safe names.`,
      );
    }
    ids.add(id);
    const status = record.status ?? "NOT_STARTED";
    const priority = record.priority ?? "MEDIUM";
    const dueInDays = record.dueInDays ?? 1;
    const taskType = record.taskType ?? "TODO";
    const reminderMinutesBefore = record.reminderMinutesBefore ?? 0;
    const assignmentType = record.assignmentType ?? "none";
    if (!["NOT_STARTED", "COMPLETED"].includes(String(status))) {
      throw new HttpError(400, `Task template ${id} has an invalid status.`);
    }
    if (!["LOW", "MEDIUM", "HIGH"].includes(String(priority))) {
      throw new HttpError(400, `Task template ${id} has an invalid priority.`);
    }
    if (!(["TODO", "CALL", "EMAIL"] as unknown[]).includes(taskType)) {
      throw new HttpError(400, `Task template ${id} has an invalid task type.`);
    }
    if (
      !Number.isInteger(dueInDays) ||
      Number(dueInDays) < 0 ||
      Number(dueInDays) > 365
    ) {
      throw new HttpError(
        400,
        `Task template ${id} due offset must be between 0 and 365 days.`,
      );
    }
    if (
      !Number.isInteger(reminderMinutesBefore) ||
      Number(reminderMinutesBefore) < 0 ||
      Number(reminderMinutesBefore) > 10_080
    ) {
      throw new HttpError(
        400,
        `Task template ${id} reminder must be between 0 and 10080 minutes before the due time.`,
      );
    }
    if (!(["none", "owner", "queue"] as unknown[]).includes(assignmentType)) {
      throw new HttpError(
        400,
        `Task template ${id} has an invalid assignee type.`,
      );
    }
    const assigneeId = optionalString(record.assigneeId, "task assignee ID");
    const queuePropertyName = optionalString(
      record.queuePropertyName,
      "task queue property",
    );
    if (assignmentType !== "none" && !assigneeId) {
      throw new HttpError(400, `Task template ${id} needs an assignee.`);
    }
    if (
      assignmentType === "queue" &&
      (!queuePropertyName || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(queuePropertyName))
    ) {
      throw new HttpError(
        400,
        `Task template ${id} has an invalid task queue.`,
      );
    }
    return {
      id,
      name: limitedString(record.name, "task template name", 120),
      description: optionalLimitedString(
        record.description,
        "task template description",
        2000,
      ),
      status: status as HandoffTaskTemplate["status"],
      priority: priority as HandoffTaskTemplate["priority"],
      dueInDays: Number(dueInDays),
      taskType: taskType as HandoffTaskTemplate["taskType"],
      reminderMinutesBefore: Number(reminderMinutesBefore),
      assignmentType: assignmentType as HandoffTaskTemplate["assignmentType"],
      assigneeId: assignmentType === "none" ? "" : assigneeId,
      queuePropertyName: assignmentType === "queue" ? queuePropertyName : "",
    };
  });
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
    trackedTicketId?: string,
  ): Promise<HandoffReadiness> {
    const [deal, properties] = await Promise.all([
      this.getDeal(dealId, settings, trackedTicketId),
      this.dealProperties(),
    ]);
    return readiness(deal, settings, propertyLabels(properties));
  }

  async evaluateRoute(
    dealId: string,
    route: HandoffRoute,
    outputIds: string[] = [],
  ): Promise<HandoffReadiness> {
    const settings = legacySettingsForRoute(route);
    const [deal, properties] = await Promise.all([
      this.getDeal(
        dealId,
        settings,
        route.outputType === "ticket" ? outputIds[0] : undefined,
        route.outputType === "ticket" ? route.subjectPrefix : undefined,
      ),
      this.dealProperties(),
    ]);
    if (route.outputType !== "ticket") delete deal.handoffTicketId;
    return readiness(
      deal,
      settings,
      propertyLabels(properties),
      route,
      outputIds,
    );
  }

  async createRoute(
    dealId: string,
    route: HandoffRoute,
    outputIds: string[] = [],
  ): Promise<HandoffReadiness> {
    const current = await this.evaluateRoute(dealId, route, outputIds);
    if (!current.configurationReady) {
      throw new HttpError(
        409,
        `Configure the destination for ${route.name} before creating it.`,
      );
    }
    if (!current.prerequisitesReady) {
      throw new HttpError(
        409,
        "Complete the required deal fields and associations before creating this handoff.",
      );
    }
    if (current.complete) return current;
    if (route.outputType === "ticket") {
      const ticket = await this.createTicket(
        dealId,
        legacySettingsForRoute(route),
        outputIds[0],
      );
      return readinessForRoute(
        ticket,
        route,
        ticket.ticketId ? [ticket.ticketId] : [],
      );
    }
    const dealName = current.dealName;
    if (route.outputType === "task") {
      const createdIds: string[] = [];
      try {
        for (const template of route.taskTemplates) {
          const task = await this.createTask(template, dealName, [
            { type: "deals", id: dealId },
          ]);
          createdIds.push(task.id);
        }
      } catch (cause) {
        await this.removeCreatedTasks(createdIds);
        throw cause;
      }
      return completedRoute(current, route, createdIds);
    }
    const project = await this.request<{ id: string }>(
      "/crm/v3/objects/projects",
      {
        method: "POST",
        body: JSON.stringify({
          properties: {
            hs_name: `${route.subjectPrefix}: ${dealName}`,
            hs_pipeline: route.pipelineId,
            hs_pipeline_stage: route.stageId,
            ...(route.ownerId ? { hs_project_owner_id: route.ownerId } : {}),
          },
        }),
      },
    );
    const createdIds = [project.id];
    try {
      await this.associate("projects", project.id, "deals", dealId);
      for (const template of route.taskTemplates) {
        const task = await this.createTask(template, dealName, [
          { type: "projects", id: project.id },
          { type: "deals", id: dealId },
        ]);
        createdIds.push(task.id);
      }
    } catch (cause) {
      for (const [index, id] of createdIds.slice().reverse().entries()) {
        const type = index === createdIds.length - 1 ? "projects" : "tasks";
        try {
          await this.request(
            `/crm/v3/objects/${type}/${encodeURIComponent(id)}`,
            { method: "DELETE" },
          );
        } catch {
          /* preserve original error */
        }
      }
      throw cause;
    }
    return completedRoute(current, route, createdIds);
  }

  async list(
    settings: HandoffSettings,
    trackedTicketForDeal: (
      dealId: string,
    ) => Promise<string | undefined> = async () => undefined,
  ): Promise<HandoffReadiness[]> {
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
    return mapConcurrent(dealIds, 3, async (dealId) =>
      this.evaluate(dealId, settings, await trackedTicketForDeal(dealId)),
    );
  }

  async listRoute(
    route: HandoffRoute,
    trackedOutputForDeal: (
      dealId: string,
    ) => Promise<string[]> = async () => [],
  ): Promise<HandoffReadiness[]> {
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
    return mapConcurrent(dealIds, 3, async (dealId) =>
      this.evaluateRoute(dealId, route, await trackedOutputForDeal(dealId)),
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

  async projectPipelines(): Promise<TicketPipeline[]> {
    return this.pipelines("projects");
  }

  async taskAssignees(): Promise<TaskAssigneeCatalog> {
    const [ownerResponse, propertyResponse, queueResponse] = await Promise.all([
      this.request<{
        results?: Array<{
          id?: string;
          email?: string;
          firstName?: string;
          lastName?: string;
          archived?: boolean;
        }>;
      }>("/crm/v3/owners/?limit=500&archived=false"),
      this.request<{
        results?: Array<{
          name?: string;
          label?: string;
          options?: Array<{ value?: string; label?: string; hidden?: boolean }>;
        }>;
      }>("/crm/v3/properties/tasks?archived=false"),
      this.request<
        | Array<{ id?: string | number; name?: string }>
        | {
            results?: Array<{ id?: string | number; name?: string }>;
            taskQueues?: Array<{ id?: string | number; name?: string }>;
          }
      >("/engagements/v1/task-queues").catch(() => []),
    ]);
    const owners = (ownerResponse.results ?? [])
      .filter((owner) => owner.id && owner.archived !== true)
      .map((owner) => ({
        id: owner.id as string,
        label:
          [owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
          owner.email ||
          `Owner ${owner.id}`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
    const propertyQueues = (propertyResponse.results ?? [])
      .filter(
        (property) =>
          property.name?.toLowerCase().includes("queue") &&
          property.options?.length,
      )
      .flatMap((property) =>
        (property.options ?? []).flatMap((option) =>
          option.value && option.label && option.hidden !== true
            ? [
                {
                  id: option.value,
                  label: option.label,
                  propertyName: property.name as string,
                },
              ]
            : [],
        ),
      )
      .sort((left, right) => left.label.localeCompare(right.label));
    const legacyQueues = (
      Array.isArray(queueResponse)
        ? queueResponse
        : (queueResponse.taskQueues ?? queueResponse.results ?? [])
    ).flatMap((queue) =>
      queue.id !== undefined && queue.name
        ? [
            {
              id: String(queue.id),
              label: queue.name,
              propertyName: "hs_queue_membership_ids",
            },
          ]
        : [],
    );
    const queues = [...legacyQueues, ...propertyQueues]
      .filter(
        (queue, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.id === queue.id &&
              candidate.propertyName === queue.propertyName,
          ) === index,
      )
      .sort((left, right) => left.label.localeCompare(right.label));
    return { owners, queues };
  }

  async isSuperAdmin(userId: string): Promise<boolean> {
    const response = await this.request<{ superAdmin?: boolean }>(
      `/settings/v3/users/${encodeURIComponent(userId)}`,
    );
    return response.superAdmin === true;
  }

  async validateSettings(settings: HandoffSettings): Promise<void> {
    const hasAssignments = settings.routes.some(
      (route) =>
        Boolean(route.ownerId) ||
        route.taskTemplates.some(
          (template) => template.assignmentType !== "none",
        ),
    );
    const [properties, ticketPipelines, projectPipelines, assignees] =
      await Promise.all([
        this.dealProperties(),
        this.ticketPipelines(),
        settings.routes.some((route) => route.outputType === "project_tasks")
          ? this.projectPipelines()
          : Promise.resolve([]),
        hasAssignments
          ? this.taskAssignees()
          : Promise.resolve({ owners: [], queues: [] }),
      ]);
    const propertyNames = new Set(properties.map((property) => property.name));
    const unknown = [
      ...new Set(settings.routes.flatMap((route) => route.requiredProperties)),
    ].filter((property) => !propertyNames.has(property));
    if (unknown.length) {
      throw new HttpError(
        400,
        `Unknown deal properties: ${unknown.join(", ")}. Refresh settings and choose current HubSpot properties.`,
      );
    }
    for (const route of settings.routes) {
      if (
        route.ownerId &&
        !assignees.owners.some((owner) => owner.id === route.ownerId)
      ) {
        throw new HttpError(
          400,
          `The selected output owner for ${route.name} no longer exists.`,
        );
      }
      for (const template of route.taskTemplates) {
        const validAssignment =
          template.assignmentType === "none" ||
          (template.assignmentType === "owner" &&
            assignees.owners.some(
              (owner) => owner.id === template.assigneeId,
            )) ||
          (template.assignmentType === "queue" &&
            assignees.queues.some(
              (queue) =>
                queue.id === template.assigneeId &&
                queue.propertyName === template.queuePropertyName,
            ));
        if (!validAssignment) {
          throw new HttpError(
            400,
            `The selected task assignee for ${template.name} no longer exists.`,
          );
        }
      }
      if (route.outputType === "task") continue;
      if (!route.pipelineId || !route.stageId) {
        throw new HttpError(
          400,
          `Choose a pipeline and initial stage for ${route.name}.`,
        );
      }
      const pipelines =
        route.outputType === "ticket" ? ticketPipelines : projectPipelines;
      const pipeline = pipelines.find((item) => item.id === route.pipelineId);
      if (
        !pipeline ||
        !pipeline.stages.some((stage) => stage.id === route.stageId)
      ) {
        throw new HttpError(
          400,
          `The selected destination for ${route.name} no longer exists.`,
        );
      }
    }
  }

  async createTicket(
    dealId: string,
    settings: HandoffSettings,
    trackedTicketId?: string,
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
      this.getDeal(dealId, settings, trackedTicketId),
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
            ...(settings.ticketOwnerId
              ? { hubspot_owner_id: settings.ticketOwnerId }
              : {}),
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
        item.key === "output"
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
    trackedTicketId?: string,
    ticketSubjectPrefix?: string,
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
      this.findHandoffTicket(dealId, trackedTicketId, ticketSubjectPrefix),
    ]);
    return { ...deal, ...(handoffTicketId ? { handoffTicketId } : {}) };
  }

  private async findHandoffTicket(
    dealId: string,
    trackedTicketId?: string,
    subjectPrefix?: string,
  ): Promise<string | undefined> {
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
    if (trackedTicketId && ids.includes(trackedTicketId)) {
      return trackedTicketId;
    }
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
    const marker = subjectPrefix
      ? `${handoffSubjectMarker}${subjectPrefix}:`
      : handoffSubjectMarker;
    return tickets.results?.find((ticket) =>
      ticket.properties?.subject?.startsWith(marker),
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

  private async associate(
    from: string,
    fromId: string,
    to: string,
    toId: string,
  ): Promise<void> {
    const label = await this.defaultAssociation(from, to);
    await this.request(
      `/crm/v4/objects/${encodeURIComponent(from)}/${encodeURIComponent(fromId)}/associations/${encodeURIComponent(to)}/${encodeURIComponent(toId)}`,
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
  }

  private async createTask(
    template: HandoffTaskTemplate,
    dealName: string,
    associations: Array<{ type: string; id: string }>,
  ): Promise<{ id: string }> {
    const dueAt = Date.now() + template.dueInDays * 86_400_000;
    const task = await this.request<{ id: string }>("/crm/v3/objects/tasks", {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date(dueAt).toISOString(),
          hs_task_subject: renderTaskText(template.name, dealName),
          hs_task_body: renderTaskText(template.description, dealName),
          hs_task_status: template.status,
          hs_task_priority: template.priority,
          hs_task_type: template.taskType,
          ...(template.reminderMinutesBefore > 0
            ? {
                hs_task_reminders: String(
                  dueAt - template.reminderMinutesBefore * 60_000,
                ),
              }
            : {}),
          ...(template.assignmentType === "owner"
            ? { hubspot_owner_id: template.assigneeId }
            : {}),
          ...(template.assignmentType === "queue"
            ? { [template.queuePropertyName]: template.assigneeId }
            : {}),
        },
      }),
    });
    try {
      for (const association of associations) {
        await this.associate(
          "tasks",
          task.id,
          association.type,
          association.id,
        );
      }
    } catch (cause) {
      try {
        await this.request(
          `/crm/v3/objects/tasks/${encodeURIComponent(task.id)}`,
          { method: "DELETE" },
        );
      } catch {
        /* preserve original error */
      }
      throw cause;
    }
    return task;
  }

  private async removeCreatedTasks(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        try {
          await this.request(
            `/crm/v3/objects/tasks/${encodeURIComponent(id)}`,
            {
              method: "DELETE",
            },
          );
        } catch {
          /* preserve the original creation error */
        }
      }),
    );
  }

  private async pipelines(objectType: "projects"): Promise<TicketPipeline[]> {
    const response = await this.request<{
      results?: Array<{
        id?: string;
        label?: string;
        stages?: Array<{ id?: string; label?: string; displayOrder?: number }>;
      }>;
    }>(`/crm/v3/pipelines/${objectType}`);
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

async function trackedTicketForDeal(
  context: RuntimeApiContext,
  portalId: number,
  dealId: string,
): Promise<string | undefined> {
  const value = await context.configuration.get(
    portalId,
    handoffTicketStorageKey(dealId),
  );
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function rememberHandoffTicket(
  context: RuntimeApiContext,
  portalId: number,
  dealId: string,
  ticketId: string,
): Promise<void> {
  await context.configuration.put(
    portalId,
    handoffTicketStorageKey(dealId),
    ticketId,
  );
}

function handoffTicketStorageKey(dealId: string): string {
  if (!/^\d+$/.test(dealId)) {
    throw new HttpError(400, "A numeric HubSpot deal ID is required.");
  }
  return `handoff.ticket.${dealId}`;
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
  route?: HandoffRoute,
  trackedOutputIds: string[] = [],
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
  const outputType = route?.outputType ?? "ticket";
  const outputIds = trackedOutputIds.length
    ? trackedOutputIds
    : deal.handoffTicketId
      ? [deal.handoffTicketId]
      : [];
  const ticketId = outputType === "ticket" ? outputIds[0] : undefined;
  const outputLabel =
    outputType === "ticket"
      ? "service ticket"
      : outputType === "task"
        ? "handoff task"
        : "project and tasks";
  items.push({
    key: "output",
    label:
      outputType === "ticket"
        ? "Service handoff ticket"
        : outputType === "task"
          ? "Handoff task"
          : "Project and task plan",
    passed: outputIds.length > 0,
    detail: outputIds.length
      ? `${outputIds.length} ${outputLabel} record${outputIds.length === 1 ? "" : "s"} created and linked.`
      : `Create the ${outputLabel} when the handoff details are ready.`,
  });
  const prerequisitesReady = items
    .filter((item) => item.key !== "output")
    .every((item) => item.passed);
  return {
    dealId: deal.id,
    dealName: deal.properties.dealname || `Deal ${deal.id}`,
    routeId: route?.id ?? "customer-success",
    routeName: route?.name ?? "Customer success handoff",
    department: route?.department ?? "Customer Success",
    outputType,
    outputIds,
    configurationReady:
      outputType === "task" ||
      Boolean(settings.ticketPipelineId && settings.ticketStageId),
    prerequisitesReady,
    complete: prerequisitesReady && outputIds.length > 0,
    ...(ticketId ? { ticketId } : {}),
    items,
  };
}

function legacySettingsForRoute(route: HandoffRoute): HandoffSettings {
  return {
    enabled: true,
    requiredProperties: route.requiredProperties,
    requireCompany: route.requireCompany,
    requireContact: route.requireContact,
    ticketPipelineId: route.pipelineId,
    ticketStageId: route.stageId,
    ticketSubjectPrefix: route.subjectPrefix,
    ticketOwnerId: route.ownerId,
    routes: [route],
  };
}

function configuredRoute(
  settings: HandoffSettings,
  routeId: string,
): HandoffRoute {
  const route = settings.routes.find((candidate) => candidate.id === routeId);
  if (!route)
    throw new HttpError(
      404,
      "That handoff route is no longer configured. Refresh and choose another route.",
    );
  return route;
}

function readinessForRoute(
  readinessResult: HandoffReadiness,
  route: HandoffRoute,
  outputIds: string[],
): HandoffReadiness {
  return completedRoute(
    { ...readinessResult, complete: false },
    route,
    outputIds,
  );
}

function completedRoute(
  current: HandoffReadiness,
  route: HandoffRoute,
  outputIds: string[],
): HandoffReadiness {
  const { ticketId: _previousTicketId, ...withoutTicketId } = current;
  return {
    ...withoutTicketId,
    routeId: route.id,
    routeName: route.name,
    department: route.department,
    outputType: route.outputType,
    outputIds,
    ...(route.outputType === "ticket" && outputIds[0]
      ? { ticketId: outputIds[0] }
      : {}),
    complete: current.prerequisitesReady && outputIds.length > 0,
    items: current.items.map((item) =>
      item.key === "output" || item.key === "ticket"
        ? {
            ...item,
            key: "output",
            passed: outputIds.length > 0,
            detail: `${route.name} created ${outputIds.length} linked HubSpot record${outputIds.length === 1 ? "" : "s"}.`,
          }
        : item,
    ),
  };
}

async function trackedOutput(
  context: RuntimeApiContext,
  portalId: number,
  dealId: string,
  route: HandoffRoute,
): Promise<StoredHandoffOutput | undefined> {
  const value = await context.configuration.get(
    portalId,
    handoffOutputStorageKey(dealId, route.id),
  );
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.outputType !== route.outputType ||
    !Array.isArray(record.ids) ||
    record.ids.some((id) => typeof id !== "string" || !id)
  )
    return undefined;
  return { outputType: route.outputType, ids: record.ids as string[] };
}

function handoffOutputStorageKey(dealId: string, routeId: string): string {
  if (!/^\d+$/.test(dealId))
    throw new HttpError(400, "A numeric HubSpot deal ID is required.");
  return `handoff.output.${routeId}.${dealId}`;
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

function renderTaskText(value: string, dealName: string): string {
  return value
    .replaceAll("{deal}", dealName)
    .replaceAll("{date}", new Date().toISOString().slice(0, 10));
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

function limitedString(value: unknown, name: string, maximum: number): string {
  const result = requiredString(value, name);
  if (result.length > maximum) {
    throw new HttpError(400, `${name} must be ${maximum} characters or fewer.`);
  }
  return result;
}

function optionalLimitedString(
  value: unknown,
  name: string,
  maximum: number,
): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string")
    throw new HttpError(400, `${name} must be a string.`);
  const result = value.trim();
  if (result.length > maximum)
    throw new HttpError(400, `${name} must be ${maximum} characters or fewer.`);
  return result;
}
