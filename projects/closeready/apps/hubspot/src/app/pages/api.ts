import { hubspot } from "@hubspot/ui-extensions";

import { CLOSEREADY_BACKEND_URL } from "./backend.ts";
import type { ReadinessRule } from "./model.ts";

export interface CatalogProperty {
  name: string;
  label?: string;
  type?: string;
}

export interface CatalogStage {
  id: string;
  label: string;
  displayOrder?: number;
}

export interface CatalogPipeline {
  id: string;
  label: string;
  stages: CatalogStage[];
}

export interface AssociationLabel {
  category: string;
  typeId: number;
  label: string | null;
}

export interface PortalCatalog {
  pipelines: CatalogPipeline[];
  dealProperties: CatalogProperty[];
  contactProperties: CatalogProperty[];
  companyProperties: CatalogProperty[];
  associationLabels: {
    contacts: AssociationLabel[];
    companies: AssociationLabel[];
  };
}

export interface StorageStatus {
  mode: "hubspot" | "external";
  durable?: boolean;
  reason?: string;
  objectTypeId?: string;
  fullyQualifiedName?: string;
}

export async function provision(portalId: number): Promise<StorageStatus> {
  return request(`/api/provision?portalId=${portalId}`, { method: "POST" });
}

export async function loadCatalog(portalId: number): Promise<PortalCatalog> {
  return request(`/api/catalog?portalId=${portalId}`);
}

export async function loadRules(
  portalId: number,
  pipelineId: string,
): Promise<ReadinessRule[]> {
  const query = new URLSearchParams({ portalId: String(portalId), pipelineId });
  const body = await request<{ results?: ReadinessRule[] }>(
    `/api/rules?${query}`,
  );
  return body.results ?? [];
}

export async function createRule(
  portalId: number,
  rule: ReadinessRule,
): Promise<ReadinessRule> {
  return request(`/api/rules?portalId=${portalId}`, {
    method: "POST",
    body: { ...rule },
  });
}

export async function deleteRule(
  portalId: number,
  ruleId: string,
): Promise<void> {
  await request(
    `/api/rules/${encodeURIComponent(ruleId)}?portalId=${portalId}`,
    {
      method: "DELETE",
    },
  );
}

async function request<T = unknown>(
  path: string,
  options: Parameters<typeof hubspot.fetch>[1] = {},
): Promise<T> {
  const response = await hubspot.fetch(
    `${CLOSEREADY_BACKEND_URL}${path}`,
    options,
  );
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `CloseReady API error ${response.status}`);
  }
  return body;
}
