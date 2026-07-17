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

  it("searches supported CRM records and returns association metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        results: [
          {
            id: "501",
            properties: {
              firstname: "Maria",
              lastname: "Jensen",
              email: "maria@example.com",
              company: "Nordlys",
            },
          },
        ],
      }),
    );
    const client = new HubSpotClient("test-token", fetcher);

    const results = await client.searchCrmRecords("contacts", "Maria");

    expect(results).toEqual([
      {
        id: "501",
        objectType: "contacts",
        objectTypeId: "0-1",
        label: "Maria Jensen",
        secondary: "maria@example.com | Nordlys",
      },
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      query: "Maria",
      limit: 10,
      after: "0",
    });
  });

  it("searches HubSpot tasks for optional entry associations", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        results: [
          {
            id: "701",
            properties: {
              hs_task_subject: "Følg op på tilbud",
              hs_task_status: "NOT_STARTED",
              hs_task_priority: "HIGH",
            },
          },
        ],
      }),
    );
    const client = new HubSpotClient("test-token", fetcher);

    const results = await client.searchCrmRecords("tasks", "tilbud");

    expect(results).toEqual([
      {
        id: "701",
        objectType: "tasks",
        objectTypeId: "0-27",
        label: "Følg op på tilbud",
        secondary: "NOT_STARTED | HIGH",
        completed: false,
      },
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "hs_task_status",
              operator: "NEQ",
              value: "COMPLETED",
            },
          ],
        },
      ],
    });
  });

  it("loads open tasks associated with a selected CRM record", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          results: [{ toObjectId: 701 }, { toObjectId: 702 }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: "701",
              properties: {
                hs_task_subject: "Åben opgave",
                hs_task_status: "NOT_STARTED",
                hs_task_priority: "HIGH",
              },
            },
            {
              id: "702",
              properties: {
                hs_task_subject: "Afsluttet opgave",
                hs_task_status: "COMPLETED",
                hs_task_priority: "LOW",
              },
            },
          ],
        }),
      );
    const client = new HubSpotClient("test-token", fetcher);

    const results = await client.listAssociatedTasks("deals", "501");

    expect(results).toEqual([
      {
        id: "701",
        objectType: "tasks",
        objectTypeId: "0-27",
        label: "Åben opgave",
        secondary: "NOT_STARTED | HIGH",
        completed: false,
      },
    ]);
    expect(fetcher.mock.calls[0]?.[0]).toContain(
      "/crm/v4/objects/deals/501/associations/tasks?limit=500",
    );
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      inputs: [{ id: "701" }, { id: "702" }],
      properties: expect.arrayContaining(["hs_task_subject", "hs_task_status"]),
    });
  });

  it("includes completed associated tasks when requested", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ results: [{ toObjectId: "702" }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: "702",
              properties: {
                hs_task_subject: "Afsluttet opgave",
                hs_task_status: "COMPLETED",
                hs_task_priority: "LOW",
              },
            },
          ],
        }),
      );
    const client = new HubSpotClient("test-token", fetcher);

    const results = await client.listAssociatedTasks("contacts", "501", true);

    expect(results[0]).toMatchObject({
      id: "702",
      completed: true,
      label: "Afsluttet opgave",
    });
  });

  it("searches HubSpot projects as primary entry associations", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        results: [
          {
            id: "9701",
            properties: {
              hs_name: "Website relaunch",
              hs_status: "IN_PROGRESS",
              hs_pipeline_stage: "execution",
            },
          },
        ],
      }),
    );
    const client = new HubSpotClient("test-token", fetcher);

    const results = await client.searchCrmRecords("projects", "Website");

    expect(results).toEqual([
      {
        id: "9701",
        objectType: "projects",
        objectTypeId: "0-970",
        label: "Website relaunch",
        secondary: "IN_PROGRESS | execution",
      },
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      properties: expect.arrayContaining(["hs_name", "hs_status"]),
    });
  });

  it("creates a dedicated custom label instead of using an invalid system association", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              category: "HUBSPOT_DEFINED",
              typeId: 1,
              label: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          category: "USER_DEFINED",
          typeId: 99,
          label: "TidsHub-post",
        }),
      )
      .mockResolvedValueOnce(Response.json({}));
    const client = new HubSpotClient("test-token", fetcher);

    await client.associate("p123_tidshub_record", "entry-1", "0-1", "501");

    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body))).toEqual([
      { associationCategory: "USER_DEFINED", associationTypeId: 99 },
    ]);
  });

  it("updates an owned entry when its week is still editable", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: "entry-1",
          properties: {
            record_kind: "time_entry",
            week_key: "2026-W29",
            entry_date: "2026-07-13",
            duration_minutes: "30",
            category: "project",
            description: "Før",
            billable: "true",
            record_status: "draft",
            hubspot_owner_id: "42",
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(
        Response.json({
          id: "entry-1",
          properties: {
            duration_minutes: "45",
            description: "Efter",
          },
        }),
      );
    const client = new HubSpotClient("test-token", fetcher);

    const entry = await client.updateEntry({
      objectType: "p123_tidshub_record",
      entryId: "entry-1",
      ownerId: "42",
      properties: {
        duration_minutes: "45",
        category: "project",
        description: "Efter",
        billable: "true",
      },
    });

    expect(entry.properties).toMatchObject({
      record_kind: "time_entry",
      duration_minutes: "45",
      description: "Efter",
    });
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe("PATCH");
  });

  it("rejects deleting an entry owned by another user", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: "entry-1",
        properties: {
          record_kind: "time_entry",
          week_key: "2026-W29",
          hubspot_owner_id: "84",
        },
      }),
    );
    const client = new HubSpotClient("test-token", fetcher);

    await expect(
      client.deleteEntry({
        objectType: "p123_tidshub_record",
        entryId: "entry-1",
        ownerId: "42",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("archives a newly created entry without applying mutable-entry checks", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    );
    const client = new HubSpotClient("test-token", fetcher);

    await client.archiveCreatedEntry("p123_tidshub_record", "entry-1");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.hubapi.com/crm/v3/objects/p123_tidshub_record/entry-1",
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("creates approval settings as a norm record", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(
        Response.json({
          id: "norm-1",
          properties: {
            record_kind: "norm",
            hubspot_user_id: "42",
            hubspot_user_email: "employee@example.com",
            approval_officer_id: "84",
            approval_officer_email: "boss@example.com",
          },
        }),
      );
    const client = new HubSpotClient("test-token", fetcher);

    const settings = await client.saveApprovalSettings({
      objectType: "p123_tidshub_record",
      primaryDisplayProperty: "record_name",
      ownerId: "42",
      ownerEmail: "employee@example.com",
      approverId: "84",
      approverEmail: "boss@example.com",
    });

    expect(settings.approverEmail).toBe("boss@example.com");
    const createBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
      properties: Record<string, string>;
    };
    expect(createBody.properties).toMatchObject({
      record_kind: "norm",
      approval_officer_id: "84",
    });
  });

  it("rejects approval by a user who is not assigned to the week", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: "week-1",
        properties: {
          record_kind: "week",
          week_key: "2026-W29",
          record_status: "submitted",
          hubspot_user_id: "42",
          hubspot_user_email: "employee@example.com",
          approval_officer_id: "84",
          approval_officer_email: "boss@example.com",
          weekly_minutes: "2220",
        },
      }),
    );
    const client = new HubSpotClient("test-token", fetcher);

    await expect(
      client.approveWeek({
        objectType: "p123_tidshub_record",
        weekId: "week-1",
        approverId: "999",
        approverEmail: "other@example.com",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("submits a week to the configured approval officer", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              id: "norm-1",
              properties: {
                record_kind: "norm",
                hubspot_user_id: "42",
                hubspot_user_email: "employee@example.com",
                approval_officer_id: "84",
                approval_officer_email: "boss@example.com",
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(
        Response.json({
          id: "week-1",
          properties: {
            record_kind: "week",
            week_key: "2026-W29",
            hubspot_user_id: "42",
            hubspot_user_email: "employee@example.com",
            approval_officer_id: "84",
            approval_officer_email: "boss@example.com",
            weekly_minutes: "2220",
            record_status: "submitted",
            submitted_at: "2026-07-13T12:00:00.000Z",
          },
        }),
      );
    const client = new HubSpotClient("test-token", fetcher);

    const week = await client.submitWeek({
      objectType: "p123_tidshub_record",
      primaryDisplayProperty: "record_name",
      ownerId: "42",
      ownerEmail: "employee@example.com",
      weekKey: "2026-W29",
      totalMinutes: 2220,
    });

    expect(week).toMatchObject({
      approverId: "84",
      status: "submitted",
      totalMinutes: 2220,
    });
    const createBody = JSON.parse(String(fetcher.mock.calls[2]?.[1]?.body)) as {
      properties: Record<string, string>;
    };
    expect(createBody.properties).toMatchObject({
      record_kind: "week",
      week_key: "2026-W29",
      record_status: "submitted",
      approval_officer_id: "84",
    });
  });
});
