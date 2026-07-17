import { describe, expect, it, vi } from "vitest";

import {
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
      vi.fn<typeof fetch>(async () =>
        Response.json({
          id: "501",
          properties: {
            dealname: "Nordic expansion",
            amount: "125000",
            closedate: "2026-07-18",
          },
          associations: {
            companies: { results: [{ id: "601" }] },
            contacts: { results: [] },
            tickets: { results: [] },
          },
        }),
      ),
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
});

function handoffFetcher(associationFails: boolean) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/crm/v3/objects/deals/501") {
      return Response.json({
        id: "501",
        properties: {
          dealname: "Nordic expansion",
          amount: "125000",
          closedate: "2026-07-18",
        },
        associations: {
          companies: { results: [{ id: "601" }] },
          contacts: { results: [{ id: "701" }] },
          tickets: { results: [] },
        },
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
