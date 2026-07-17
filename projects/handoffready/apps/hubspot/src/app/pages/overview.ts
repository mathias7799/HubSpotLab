export interface HandoffOverviewItem {
  dealId: string;
  dealName: string;
  configurationReady: boolean;
  prerequisitesReady: boolean;
  complete: boolean;
  ticketId?: string;
  items: Array<{ key: string; passed: boolean }>;
}

export function summarizeHandoffs(results: HandoffOverviewItem[]) {
  return {
    complete: results.filter((item) => item.complete).length,
    ready: results.filter((item) => !item.complete && item.prerequisitesReady)
      .length,
    blocked: results.filter((item) => !item.prerequisitesReady).length,
  };
}

export function handoffStatus(item: HandoffOverviewItem): {
  label: string;
  variant: "success" | "info" | "warning";
} {
  if (item.complete) return { label: "Complete", variant: "success" };
  if (item.prerequisitesReady) {
    return { label: "Ready for ticket", variant: "info" };
  }
  return { label: "Needs attention", variant: "warning" };
}

export function missingCount(item: HandoffOverviewItem): number {
  return item.items.filter((check) => !check.passed).length;
}
