import { describe, expect, it } from "vitest";

import {
  handoffStatus,
  missingCount,
  summarizeHandoffs,
  type HandoffOverviewItem,
} from "./overview.js";

const item = (
  overrides: Partial<HandoffOverviewItem>,
): HandoffOverviewItem => ({
  dealId: "501",
  dealName: "Nordic expansion",
  configurationReady: true,
  prerequisitesReady: false,
  complete: false,
  items: [{ key: "amount", passed: false }],
  ...overrides,
});

describe("handoff overview model", () => {
  it("separates complete, ready, and blocked deals", () => {
    expect(
      summarizeHandoffs([
        item({ complete: true, prerequisitesReady: true }),
        item({ prerequisitesReady: true }),
        item({ prerequisitesReady: false }),
      ]),
    ).toEqual({ complete: 1, ready: 1, blocked: 1 });
  });

  it("uses explicit non-color status labels", () => {
    expect(handoffStatus(item({ complete: true }))).toEqual({
      label: "Complete",
      variant: "success",
    });
    expect(handoffStatus(item({ prerequisitesReady: true }))).toEqual({
      label: "Ready for ticket",
      variant: "info",
    });
    expect(handoffStatus(item({}))).toEqual({
      label: "Needs attention",
      variant: "warning",
    });
  });

  it("counts every unresolved readiness item", () => {
    expect(
      missingCount(
        item({
          items: [
            { key: "closed-won", passed: true },
            { key: "amount", passed: false },
            { key: "ticket", passed: false },
          ],
        }),
      ),
    ).toBe(2);
  });
});
