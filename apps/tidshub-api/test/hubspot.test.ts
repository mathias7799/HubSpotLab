import { describe, expect, it, vi } from "vitest";

import { HubSpotClient } from "../src/hubspot.js";

describe("HubSpotClient", () => {
  it("uses the complete 2026.03 search request shape", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ results: [] }),
    );
    const client = new HubSpotClient("test-token", fetcher);

    await client.searchEntries({
      objectType: "p123_tidshub_poster",
      from: "2026-07-13",
      to: "2026-07-19",
      ownerId: "42",
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      after: "0",
      limit: 100,
      sorts: ["entry_date"],
      properties: expect.arrayContaining(["entry_date", "billable"]),
      filterGroups: [
        {
          filters: expect.arrayContaining([
            {
              propertyName: "record_kind",
              operator: "EQ",
              value: "time_entry",
            },
            {
              propertyName: "entry_date",
              operator: "GTE",
              value: "1783900800000",
            },
            {
              propertyName: "entry_date",
              operator: "LTE",
              value: "1784419200000",
            },
            {
              propertyName: "hubspot_owner_id",
              operator: "EQ",
              value: "42",
            },
          ]),
        },
      ],
    });
  });
});
