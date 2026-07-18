export interface HandoffOverviewItem {
  dealId: string;
  dealName: string;
  configurationReady: boolean;
  prerequisitesReady: boolean;
  complete: boolean;
  ticketId?: string;
  items: Array<{ key: string; label: string; passed: boolean }>;
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
  return unresolvedPrerequisites(item).length;
}

export function attentionSummary(item: HandoffOverviewItem): string {
  if (!item.configurationReady) return "Finish HandoffReady setup";
  if (item.complete) return "No action needed";
  const unresolved = unresolvedPrerequisites(item);
  if (unresolved.length === 0) return "Create the service ticket";
  const labels = unresolved.map((check) => check.label);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more`;
}

function unresolvedPrerequisites(item: HandoffOverviewItem) {
  return item.items.filter((check) => check.key !== "ticket" && !check.passed);
}
