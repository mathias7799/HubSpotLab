import { describe, expect, it, vi } from "vitest";
import type { RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

import {
  createHandoffTicket,
  defaultHandoffSettings,
  HandoffService,
  parseHandoffSettings,
} from "../src/handoff.js";

const configured = {
  ...defaultHandoffSettings,
  ticketPipelineId: "support",
  ticketStageId: "new",
};

describe("HandoffReady domain service", () => {
  it("evaluates required properties and CRM associations", async () => {
    const service = new HandoffService(
      "token",
      vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === "/crm/v3/objects/deals/501") {
          return Response.json({
            id: "501",
            properties: {
              dealname: "Nordic expansion",
              amount: "125000",
              closedate: "2026-07-18",
              hs_is_closed_won: "true",
            },
            associations: {
              companies: { results: [{ id: "601" }] },
              contacts: { results: [] },
            },
          });
        }
        if (path.endsWith("/associations/tickets")) {
          return Response.json({ results: [] });
        }
        if (path === "/crm/v3/properties/deals") {
          return propertyResponse();
        }
        throw new Error(`Unexpected test request: GET ${path}`);
      }),
    );

    const result = await service.evaluate("501", configured);

    expect(result).toMatchObject({
      dealName: "Nordic expansion",
      configurationReady: true,
      prerequisitesReady: false,
      complete: false,
    });
    expect(result.items).toContainEqual(
      expect.objectContaining({ key: "contact", passed: false }),
    );
  });

  it("creates and associates a ticket when prerequisites pass", async () => {
    const fetcher = handoffFetcher(false);
    const service = new HandoffService("token", fetcher);

    const result = await service.createTicket("501", {
      ...configured,
      ticketOwnerId: "owner-42",
    });

    expect(result).toMatchObject({ complete: true, ticketId: "ticket-1" });
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/associations/deals/501") &&
          init?.method === "PUT",
      ),
    ).toBe(true);
    const ticketCreate = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/crm/v3/objects/tickets"),
    );
    expect(JSON.parse(String(ticketCreate?.[1]?.body))).toMatchObject({
      properties: { hubspot_owner_id: "owner-42" },
    });
  });

  it("archives a ticket when its deal association fails", async () => {
    const fetcher = handoffFetcher(true);
    const service = new HandoffService("token", fetcher);

    await expect(service.createTicket("501", configured)).rejects.toMatchObject(
      {
        status: 400,
      },
    );
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/crm/v3/objects/tickets/ticket-1") &&
          init?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("blocks ticket creation until the deal is closed won", async () => {
    const fetcher = handoffFetcher(false, { closedWon: false });
    const service = new HandoffService("token", fetcher);

    await expect(service.createTicket("501", configured)).rejects.toMatchObject(
      {
        status: 409,
      },
    );
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          new URL(String(url)).pathname === "/crm/v3/objects/tickets" &&
          init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("ignores unrelated tickets and recognizes only HandoffReady tickets", async () => {
    const unrelated = new HandoffService(
      "token",
      handoffFetcher(false, { existingTicketSubject: "General support issue" }),
    );
    const unrelatedResult = await unrelated.evaluate("501", configured);
    expect(unrelatedResult.complete).toBe(false);
    expect(unrelatedResult.ticketId).toBeUndefined();

    const handoff = new HandoffService(
      "token",
      handoffFetcher(false, {
        existingTicketSubject:
          "HandoffReady - Customer handoff: Nordic expansion",
      }),
    );
    await expect(handoff.evaluate("501", configured)).resolves.toMatchObject({
      complete: true,
      ticketId: "existing-ticket",
    });
  });

  it("recognizes a tracked handoff ticket after its subject is renamed", async () => {
    const service = new HandoffService(
      "token",
      handoffFetcher(false, {
        existingTicketSubject: "Implementation for Nordic expansion",
      }),
    );

    await expect(
      service.evaluate("501", configured, "existing-ticket"),
    ).resolves.toMatchObject({
      complete: true,
      ticketId: "existing-ticket",
    });
  });

  it("stores the durable ticket identity after successful creation", async () => {
    const put = vi.fn(async () => undefined);
    const context = {
      idempotency: {
        claim: vi.fn(async () => true),
        release: vi.fn(async () => undefined),
      },
      configuration: {
        get: vi.fn(async () => null),
        put,
      },
      accessTokenForPortal: vi.fn(async () => "token"),
      fetcher: handoffFetcher(false),
    } as unknown as RuntimeApiContext;

    await expect(
      createHandoffTicket(context, 123, "501", configured),
    ).resolves.toMatchObject({ ticketId: "ticket-1", complete: true });
    expect(put).toHaveBeenCalledWith(123, "handoff.ticket.501", "ticket-1");
  });

  it("reports a recoverable partial write when ticket tracking cannot be stored", async () => {
    const context = {
      idempotency: {
        claim: vi.fn(async () => true),
        release: vi.fn(async () => undefined),
      },
      configuration: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {
          throw new Error("Store unavailable");
        }),
      },
      accessTokenForPortal: vi.fn(async () => "token"),
      fetcher: handoffFetcher(false),
    } as unknown as RuntimeApiContext;

    await expect(
      createHandoffTicket(context, 123, "501", configured),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("Ticket ticket-1 was created"),
    });
    expect(context.idempotency.release).toHaveBeenCalled();
  });

  it("validates stored property names and ticket configuration", () => {
    expect(() =>
      parseHandoffSettings({
        ...configured,
        requiredProperties: ["dealname", "bad property"],
      }),
    ).toThrowError(/internal property names/);
  });

  it("normalizes ticket pipelines for native settings selectors", async () => {
    const service = new HandoffService(
      "token",
      vi.fn<typeof fetch>(async () =>
        Response.json({
          results: [
            {
              id: "support",
              label: "Customer service",
              stages: [
                { id: "new", label: "New", displayOrder: 0 },
                { id: "closed", label: "Closed", displayOrder: 1 },
              ],
            },
          ],
        }),
      ),
    );

    await expect(service.ticketPipelines()).resolves.toEqual([
      {
        id: "support",
        label: "Customer service",
        stages: [
          { id: "new", label: "New", displayOrder: 0 },
          { id: "closed", label: "Closed", displayOrder: 1 },
        ],
      },
    ]);
  });

  it("rejects stale property and ticket-stage configuration", async () => {
    const service = new HandoffService(
      "token",
      vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === "/crm/v3/properties/deals") return propertyResponse();
        if (path === "/crm/v3/pipelines/tickets") {
          return Response.json({
            results: [
              {
                id: "support",
                label: "Customer service",
                stages: [{ id: "new", label: "New", displayOrder: 0 }],
              },
            ],
          });
        }
        throw new Error(`Unexpected settings test request: ${path}`);
      }),
    );

    await expect(
      service.validateSettings({
        ...configured,
        requiredProperties: ["dealname", "deleted_property"],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.validateSettings({ ...configured, ticketStageId: "closed" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects concurrent ticket creation before any CRM mutation", async () => {
    const accessTokenForPortal = vi.fn(async () => "token");
    const context = {
      idempotency: {
        claim: vi.fn(async () => false),
        release: vi.fn(async () => undefined),
      },
      accessTokenForPortal,
      fetcher: vi.fn<typeof fetch>(),
    } as unknown as RuntimeApiContext;

    await expect(
      createHandoffTicket(context, 123, "501", configured),
    ).rejects.toMatchObject({ status: 409 });
    expect(accessTokenForPortal).not.toHaveBeenCalled();
    expect(context.fetcher).not.toHaveBeenCalled();
  });

  it("creates a standalone task for a configured department route", async () => {
    const fetcher = routeFetcher();
    const service = new HandoffService("token", fetcher);
    const result = await service.createRoute("501", {
      id: "finance",
      name: "Finance handoff",
      department: "Finance",
      outputType: "task",
      requiredProperties: ["dealname"],
      requireCompany: true,
      requireContact: false,
      pipelineId: "",
      stageId: "",
      subjectPrefix: "Prepare billing",
      ownerId: "",
      taskTemplates: [
        {
          id: "finance-review",
          name: "Finance review: {deal}",
          description: "Confirm billing details for {deal}.",
          status: "NOT_STARTED",
          priority: "HIGH",
          dueInDays: 2,
          taskType: "CALL",
          reminderMinutesBefore: 30,
          assignmentType: "owner",
          assigneeId: "owner-42",
          queuePropertyName: "",
        },
        {
          id: "billing-check",
          name: "Billing check: {deal}",
          description: "Verify the billing contact.",
          status: "NOT_STARTED",
          priority: "MEDIUM",
          dueInDays: 3,
          taskType: "EMAIL",
          reminderMinutesBefore: 0,
          assignmentType: "queue",
          assigneeId: "queue-7",
          queuePropertyName: "hs_queue_membership_ids",
        },
      ],
    });
    expect(result).toMatchObject({
      complete: true,
      routeId: "finance",
      outputType: "task",
      outputIds: ["task-1", "task-2"],
    });
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith("/crm/v3/objects/tasks"),
      ),
    ).toBe(true);
    const taskCreate = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/crm/v3/objects/tasks"),
    );
    expect(JSON.parse(String(taskCreate?.[1]?.body))).toMatchObject({
      properties: {
        hs_task_subject: "Finance review: Nordic expansion",
        hs_task_body: "Confirm billing details for Nordic expansion.",
        hs_task_status: "NOT_STARTED",
        hs_task_priority: "HIGH",
        hs_task_type: "CALL",
        hs_task_reminders: expect.any(String),
        hubspot_owner_id: "owner-42",
      },
    });
    const taskCreates = fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith("/crm/v3/objects/tasks"),
    );
    expect(JSON.parse(String(taskCreates[1]?.[1]?.body))).toMatchObject({
      properties: {
        hs_task_subject: "Billing check: Nordic expansion",
        hs_queue_membership_ids: "queue-7",
      },
    });
  });

  it("creates a project and reusable task plan for a project route", async () => {
    const fetcher = routeFetcher();
    const service = new HandoffService("token", fetcher);
    const result = await service.createRoute("501", {
      id: "implementation",
      name: "Implementation handoff",
      department: "Implementation",
      outputType: "project_tasks",
      requiredProperties: ["dealname"],
      requireCompany: true,
      requireContact: true,
      pipelineId: "project-pipeline",
      stageId: "planned",
      subjectPrefix: "Implementation",
      ownerId: "owner-42",
      taskTemplates: [
        {
          id: "kickoff",
          name: "Kickoff {deal}",
          description: "Prepare kickoff.",
          status: "NOT_STARTED",
          priority: "HIGH",
          dueInDays: 1,
          taskType: "TODO",
          reminderMinutesBefore: 0,
          assignmentType: "none",
          assigneeId: "",
          queuePropertyName: "",
        },
        {
          id: "delivery-plan",
          name: "Confirm delivery plan",
          description: "Document the plan.",
          status: "NOT_STARTED",
          priority: "MEDIUM",
          dueInDays: 3,
          taskType: "TODO",
          reminderMinutesBefore: 0,
          assignmentType: "none",
          assigneeId: "",
          queuePropertyName: "",
        },
      ],
    });
    expect(result).toMatchObject({
      complete: true,
      outputType: "project_tasks",
      outputIds: ["project-1", "task-1", "task-2"],
    });
    const projectCreate = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/crm/v3/objects/projects"),
    );
    expect(JSON.parse(String(projectCreate?.[1]?.body))).toMatchObject({
      properties: { hs_project_owner_id: "owner-42" },
    });
  });

  it("validates configurable route identity and task plans", () => {
    expect(() =>
      parseHandoffSettings({
        ...configured,
        routes: [
          {
            id: "implementation",
            name: "Implementation",
            department: "Services",
            outputType: "project_tasks",
            requiredProperties: ["dealname"],
            requireCompany: true,
            requireContact: true,
            pipelineId: "projects",
            stageId: "new",
            subjectPrefix: "Implementation",
            taskTemplates: [],
          },
        ],
      }),
    ).toThrowError(/needs at least one task template/);
  });

  it("migrates legacy task names into structured templates", () => {
    const settings = parseHandoffSettings({
      ...configured,
      routes: [
        {
          id: "implementation",
          name: "Implementation",
          department: "Services",
          outputType: "project_tasks",
          requiredProperties: ["dealname"],
          requireCompany: true,
          requireContact: true,
          pipelineId: "projects",
          stageId: "new",
          subjectPrefix: "Implementation",
          taskTemplates: ["Kickoff {deal}"],
        },
      ],
    });
    expect(settings.routes[0]?.taskTemplates[0]).toEqual({
      id: "task-1",
      name: "Kickoff {deal}",
      description: "",
      status: "NOT_STARTED",
      priority: "MEDIUM",
      dueInDays: 1,
      taskType: "TODO",
      reminderMinutesBefore: 0,
      assignmentType: "none",
      assigneeId: "",
      queuePropertyName: "",
    });
  });

  it("loads HubSpot people and task queues for template assignment", async () => {
    const service = new HandoffService(
      "token",
      vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === "/crm/v3/owners/") {
          return Response.json({
            results: [
              {
                id: "owner-42",
                firstName: "Ada",
                lastName: "Lovelace",
                email: "ada@example.com",
              },
            ],
          });
        }
        if (path === "/crm/v3/properties/tasks") {
          return Response.json({
            results: [
              {
                name: "hs_queue_membership_ids",
                label: "Task queues",
                options: [
                  { value: "queue-7", label: "Implementation", hidden: false },
                ],
              },
            ],
          });
        }
        if (path === "/engagements/v1/task-queues") {
          return Response.json([
            { id: "queue-7", name: "Implementation" },
            { id: 8, name: "Customer Success" },
          ]);
        }
        throw new Error(`Unexpected assignee request: GET ${path}`);
      }),
    );

    await expect(service.taskAssignees()).resolves.toEqual({
      owners: [{ id: "owner-42", label: "Ada Lovelace" }],
      queues: [
        {
          id: "8",
          label: "Customer Success",
          propertyName: "hs_queue_membership_ids",
        },
        {
          id: "queue-7",
          label: "Implementation",
          propertyName: "hs_queue_membership_ids",
        },
      ],
    });
  });
});

function routeFetcher() {
  let taskNumber = 0;
  return vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/crm/v3/objects/deals/501") {
      return Response.json({
        id: "501",
        properties: { dealname: "Nordic expansion", hs_is_closed_won: "true" },
        associations: {
          companies: { results: [{ id: "601" }] },
          contacts: { results: [{ id: "701" }] },
        },
      });
    }
    if (path === "/crm/v3/properties/deals") return propertyResponse();
    if (path === "/crm/v4/objects/deals/501/associations/tickets")
      return Response.json({ results: [] });
    if (path === "/crm/v3/objects/tasks" && init?.method === "POST")
      return Response.json({ id: `task-${++taskNumber}` });
    if (path === "/crm/v3/objects/projects" && init?.method === "POST")
      return Response.json({ id: "project-1" });
    if (path.includes("/labels"))
      return Response.json({
        results: [{ category: "HUBSPOT_DEFINED", typeId: 1, label: null }],
      });
    if (path.includes("/associations/") && init?.method === "PUT")
      return new Response(null, { status: 204 });
    throw new Error(
      `Unexpected route test request: ${init?.method ?? "GET"} ${path}`,
    );
  });
}

function handoffFetcher(
  associationFails: boolean,
  options: { closedWon?: boolean; existingTicketSubject?: string } = {},
) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/crm/v3/objects/deals/501") {
      return Response.json({
        id: "501",
        properties: {
          dealname: "Nordic expansion",
          amount: "125000",
          closedate: "2026-07-18",
          hs_is_closed_won: options.closedWon === false ? "false" : "true",
        },
        associations: {
          companies: { results: [{ id: "601" }] },
          contacts: { results: [{ id: "701" }] },
        },
      });
    }
    if (path === "/crm/v3/properties/deals") {
      return propertyResponse();
    }
    if (path === "/crm/v4/objects/deals/501/associations/tickets") {
      return Response.json({
        results: options.existingTicketSubject
          ? [{ toObjectId: "existing-ticket" }]
          : [],
      });
    }
    if (
      path === "/crm/v3/objects/tickets/batch/read" &&
      init?.method === "POST"
    ) {
      return Response.json({
        results: [
          {
            id: "existing-ticket",
            properties: { subject: options.existingTicketSubject },
          },
        ],
      });
    }
    if (path === "/crm/v3/objects/tickets" && init?.method === "POST") {
      return Response.json({ id: "ticket-1" });
    }
    if (path === "/crm/v4/associations/tickets/deals/labels") {
      return Response.json({
        results: [{ category: "HUBSPOT_DEFINED", typeId: 28, label: null }],
      });
    }
    if (path.endsWith("/associations/deals/501")) {
      return associationFails
        ? Response.json({ message: "Association failed." }, { status: 400 })
        : new Response(null, { status: 204 });
    }
    if (
      path === "/crm/v3/objects/tickets/ticket-1" &&
      init?.method === "DELETE"
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(
      `Unexpected test request: ${init?.method ?? "GET"} ${path}`,
    );
  });
}

function propertyResponse(): Response {
  return Response.json({
    results: [
      { name: "dealname", label: "Deal name" },
      { name: "amount", label: "Amount" },
      { name: "closedate", label: "Close date" },
    ],
  });
}
