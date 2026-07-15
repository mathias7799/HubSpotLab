import type { FactDefinition } from "./model.js";

export const factCatalog: readonly FactDefinition[] = [
  property("deal.amount", "Deal amount", "number", [
    "present",
    "greater_or_equal",
  ]),
  property("deal.closedate", "Close date", "string", ["present"]),
  property("deal.dealname", "Deal name", "string", ["present"]),
  property("deal.hubspot_owner_id", "Deal owner", "string", ["present"]),
  property("deal.hs_next_step", "Next step", "string", ["present"]),
  {
    key: "associations.contacts.count",
    label: "Associated contacts",
    source: "association",
    valueType: "count",
    nativeRequiredCompatible: false,
    supportedOperators: ["count_at_least", "greater_or_equal"],
  },
  {
    key: "associations.companies.count",
    label: "Associated companies",
    source: "association",
    valueType: "count",
    nativeRequiredCompatible: false,
    supportedOperators: ["count_at_least", "greater_or_equal"],
  },
  {
    key: "line_items.count",
    label: "Line items",
    source: "line_items",
    valueType: "count",
    nativeRequiredCompatible: false,
    supportedOperators: ["count_at_least", "greater_or_equal"],
  },
  {
    key: "quotes.approved.count",
    label: "Approved quotes",
    source: "quotes",
    valueType: "count",
    nativeRequiredCompatible: false,
    supportedOperators: ["count_at_least", "greater_or_equal"],
  },
  {
    key: "tasks.open.count",
    label: "Open tasks",
    source: "tasks",
    valueType: "count",
    nativeRequiredCompatible: false,
    supportedOperators: ["equals"],
  },
] as const;

function property(
  key: string,
  label: string,
  valueType: "string" | "number",
  supportedOperators: FactDefinition["supportedOperators"],
): FactDefinition {
  return {
    key,
    label,
    source: "deal",
    valueType,
    nativeRequiredCompatible: true,
    supportedOperators,
  };
}
