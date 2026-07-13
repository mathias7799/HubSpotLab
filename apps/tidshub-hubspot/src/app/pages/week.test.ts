import { describe, expect, it } from "vitest";

import { defaultNorm, type TimeEntry } from "./model.ts";
import {
  formatMinutes,
  isoDateFromInput,
  isoWeekForDate,
  shiftIsoWeek,
  summarizeWeek,
} from "./week.ts";

describe("isoDateFromInput", () => {
  it("accepts the string emitted by the HubSpot page form", () => {
    expect(isoDateFromInput("2026-07-13")).toBe("2026-07-13");
  });

  it("accepts DateInput parts and rejects impossible dates", () => {
    expect(isoDateFromInput({ year: 2026, month: 6, date: 13 })).toBe(
      "2026-07-13",
    );
    expect(isoDateFromInput({ year: 2026, month: 1, date: 30 })).toBeNull();
  });
});

describe("ISO weeks", () => {
  it("handles ISO week 53 across a year boundary", () => {
    const range = isoWeekForDate(new Date("2020-12-31T12:00:00.000Z"));
    expect(range.weekKey).toBe("2020-W53");
    expect(range.start).toBe("2020-12-28");
    expect(range.end).toBe("2021-01-03");
  });

  it("shifts to the next ISO week", () => {
    const range = isoWeekForDate(new Date("2026-07-13T12:00:00.000Z"));
    expect(shiftIsoWeek(range, 1).weekKey).toBe("2026-W30");
  });
});

describe("week summary", () => {
  it("computes totals, differences, and billable share", () => {
    const range = isoWeekForDate(new Date("2026-07-13T12:00:00.000Z"));
    const entries: TimeEntry[] = [
      {
        id: "1",
        entryDate: "2026-07-13",
        startedAt: null,
        endedAt: null,
        durationMinutes: 444,
        category: "project",
        registrationType: null,
        description: "Customer work",
        billable: true,
        status: "draft",
        associationType: null,
        associationId: null,
        associationLabel: null,
      },
      {
        id: "2",
        entryDate: "2026-07-14",
        startedAt: null,
        endedAt: null,
        durationMinutes: 60,
        category: "internal",
        registrationType: null,
        description: "Planning",
        billable: false,
        status: "draft",
        associationType: null,
        associationId: null,
        associationLabel: null,
      },
    ];

    const summary = summarizeWeek(entries, range, defaultNorm);
    expect(summary.totalMinutes).toBe(504);
    expect(summary.billableMinutes).toBe(444);
    expect(summary.billablePercentage).toBe(88);
    expect(summary.differenceMinutes).toBe(504 - 2220);
  });
});

describe("duration formatting", () => {
  it("normalizes minutes", () => {
    expect(formatMinutes(2280)).toBe("38t 0m");
    expect(formatMinutes(-75)).toBe("-1t 15m");
  });
});
