import { describe, expect, it } from "vitest";

import {
  attentionSummary,
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
  routeName: "Customer success handoff",
  department: "Customer Success",
  outputType: "ticket",
  outputIds: [],
  items: [{ key: "amount", label: "Amount", passed: false }],
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
      label: "Ready to create",
      variant: "info",
    });
    expect(handoffStatus(item({}))).toEqual({
      label: "Needs attention",
      variant: "warning",
    });
  });

  it("counts only unresolved prerequisites, not the ticket action", () => {
    expect(
      missingCount(
        item({
          items: [
            { key: "closed-won", label: "Closed-won deal", passed: true },
            { key: "amount", label: "Amount", passed: false },
            { key: "ticket", label: "Service ticket", passed: false },
          ],
        }),
      ),
    ).toBe(1);
  });

  it("explains the next action in plain language", () => {
    expect(attentionSummary(item({ configurationReady: false }))).toBe(
      "Finish HandoffReady setup",
    );
    expect(
      attentionSummary(
        item({
          items: [
            { key: "amount", label: "Amount", passed: false },
            { key: "contact", label: "Associated contact", passed: false },
            { key: "company", label: "Associated company", passed: false },
          ],
        }),
      ),
    ).toBe("Amount, Associated contact +1 more");
    expect(
      attentionSummary(item({ prerequisitesReady: true, items: [] })),
    ).toBe("Create the handoff destination");
  });
});
