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
      fetcher: vi.fn<typeof fetch>(async () =>
        Response.json({
          id: "987",
          properties: { dealname: "Expansion", amount: "", closedate: "" },
          associations: {
            companies: { results: [] },
            contacts: { results: [] },
            tickets: { results: [] },
          },
        }),
      ),
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
        body,
      });

    await expect(
      (await handleHandoffWorkflowAction(request(), context))?.json(),
    ).resolves.toEqual({
      outputFields: { status: "blocked", missing_count: 5, ticket_id: "" },
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
        body: JSON.stringify({ callbackId: "missing-context" }),
      }),
      context,
    ).catch((cause: { status?: number }) => cause);

    expect(response?.status).toBe(400);
  });
});
