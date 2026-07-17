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

    const result = await service.createTicket("501", configured);

    expect(result).toMatchObject({ complete: true, ticketId: "ticket-1" });
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).includes("/associations/deals/501") &&
          init?.method === "PUT",
      ),
    ).toBe(true);
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
});

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
