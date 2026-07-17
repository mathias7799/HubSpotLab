import { describe, expect, it, vi } from "vitest";

import type { RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

import { sendAppEvent } from "../src/features/app-events.js";

describe("HubSpot app events", () => {
  it("sends an authenticated CRM event payload", async () => {
    const mockFetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(null, { status: 204 }),
    );
    const fetcher = mockFetch as typeof fetch;
    const context = {
      accessTokenForPortal: vi.fn(async () => "access-token"),
      fetcher,
    } as unknown as RuntimeApiContext;
    await sendAppEvent(
      {
        portalId: 123456,
        eventName: "pe123_example_activity",
        objectId: "987",
        occurredAt: new Date("2026-01-02T03:04:05.000Z"),
        properties: { activityName: "Demo", category: "standard" },
      },
      context,
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/events/v3/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      }),
    );
    const init = mockFetch.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      eventName: "pe123_example_activity",
      objectId: "987",
      occurredAt: "2026-01-02T03:04:05.000Z",
    });
  });
});
