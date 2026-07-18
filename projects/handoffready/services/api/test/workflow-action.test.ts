import { describe, expect, it, vi } from "vitest";
import type { RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

import { handleHandoffWorkflowAction } from "../src/features/workflow-action.js";
import { defaultHandoffSettings } from "../src/handoff.js";

describe("HandoffReady workflow action", () => {
  it("evaluates once and returns a stable duplicate result", async () => {
    const claim = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const context = {
      verifyRequest: async () => undefined,
      accessTokenForPortal: async () => "token",
      configuration: {
        get: async () => ({
          ...defaultHandoffSettings,
          ticketPipelineId: "support",
          ticketStageId: "new",
        }),
      },
      idempotency: { claim, release: async () => undefined },
      fetcher: vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === "/crm/v3/objects/deals/987") {
          return Response.json({
            id: "987",
            properties: {
              dealname: "Expansion",
              amount: "",
              closedate: "",
              hs_is_closed_won: "true",
            },
            associations: {
              companies: { results: [] },
              contacts: { results: [] },
            },
          });
        }
        if (path.endsWith("/associations/tickets")) {
          return Response.json({ results: [] });
        }
        if (path === "/crm/v3/properties/deals") {
          return Response.json({
            results: [
              { name: "dealname", label: "Deal name" },
              { name: "amount", label: "Amount" },
              { name: "closedate", label: "Close date" },
            ],
          });
        }
        throw new Error(`Unexpected workflow test request: ${path}`);
      }),
    } as unknown as RuntimeApiContext;
    const body = JSON.stringify({
      callbackId: "callback-1",
      origin: { portalId: 123456 },
      object: { objectId: 987, objectType: "DEAL" },
      inputFields: { mode: "evaluate" },
    });
    const request = () =>
      new Request("http://localhost:8788/workflow-actions/prepare-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

    await expect(
      (await handleHandoffWorkflowAction(request(), context))?.json(),
    ).resolves.toEqual({
      outputFields: {
        status: "blocked",
        missing_count: 5,
        ticket_id: "",
        output_ids: "",
      },
    });
    await expect(
      (await handleHandoffWorkflowAction(request(), context))?.json(),
    ).resolves.toEqual({
      outputFields: { status: "already_processed" },
    });
  });

  it("rejects incomplete workflow context", async () => {
    const context = {
      verifyRequest: async () => undefined,
      idempotency: { claim: async () => true },
    } as unknown as RuntimeApiContext;
    const response = await handleHandoffWorkflowAction(
      new Request("http://localhost:8788/workflow-actions/prepare-handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackId: "missing-context" }),
      }),
      context,
    ).catch((cause: { status?: number }) => cause);

    expect(response?.status).toBe(400);
  });

  it("rejects non-JSON workflow requests before processing", async () => {
    const context = {
      verifyRequest: async () => undefined,
    } as unknown as RuntimeApiContext;
    const response = await handleHandoffWorkflowAction(
      new Request("http://localhost:8788/workflow-actions/prepare-handoff", {
        method: "POST",
        body: "not-json",
      }),
      context,
    ).catch((cause: { status?: number }) => cause);

    expect(response?.status).toBe(415);
  });
});
