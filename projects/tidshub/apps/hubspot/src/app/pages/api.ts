import { hubspot } from "@hubspot/ui-extensions";

import { TIDSHUB_BACKEND_URL } from "./backend.ts";
import {
  toTimeEntry,
  type TidsHubRecord,
  type TimeCategory,
  type TimeEntry,
} from "./model.ts";
import type { IsoWeekRange } from "./week.ts";

interface EntriesResponse {
  results?: unknown;
}

export interface HubSpotUser {
  id: string;
  email: string;
  label: string;
}

export interface CrmAssociationResult {
  id: string;
  objectType:
    | "contacts"
    | "companies"
    | "deals"
    | "tickets"
    | "projects"
    | "tasks";
  objectTypeId: string;
  label: string;
  secondary: string;
  completed?: boolean;
}

export interface ApprovalSettings {
  id: string;
  ownerId: string;
  ownerEmail: string;
  approverId: string;
  approverEmail: string;
}

export interface WeekApproval {
  id: string;
  weekKey: string;
  ownerId: string;
  ownerEmail: string;
  approverId: string;
  approverEmail: string;
  status: string;
  totalMinutes: number;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
}

export interface CreateTimeEntryInput {
  portalId: number;
  userId: string;
  userEmail: string;
  entryDate: string;
  durationMinutes: number;
  category: TimeCategory;
  description?: string;
  billable: boolean;
  weekKey: string;
  association?: {
    objectType: string;
    objectTypeId: string;
    objectId: string;
    label: string;
  };
  taskAssociation?: {
    objectType: "tasks";
    objectTypeId: string;
    objectId: string;
    label: string;
  };
}

export async function searchTimeEntries(
  range: IsoWeekRange,
  portalId: number,
  ownerId: string,
): Promise<TimeEntry[]> {
  const url = new URL(`${TIDSHUB_BACKEND_URL}/api/entries`);
  url.searchParams.set("portalId", String(portalId));
  url.searchParams.set("ownerId", ownerId);
  url.searchParams.set("from", range.start);
  url.searchParams.set("to", range.end);
  const body = await request<EntriesResponse>(url.toString());
  return asRecords(body.results)
    .map(toTimeEntry)
    .filter((entry): entry is TimeEntry => entry !== null);
}

export async function createTimeEntry(
  input: CreateTimeEntryInput,
): Promise<TimeEntry> {
  const record = await request<TidsHubRecord>(
    `${TIDSHUB_BACKEND_URL}/api/entries?portalId=${input.portalId}`,
    {
      method: "POST",
      body: {
        properties: {
          record_name: `${input.entryDate} - ${input.description ?? categoryLabel(input.category)}`,
          week_key: input.weekKey,
          entry_date: input.entryDate,
          duration_minutes: input.durationMinutes,
          category: input.category,
          description: input.description ?? "",
          billable: input.billable,
          record_status: "draft",
          hubspot_user_id: input.userId,
          hubspot_user_email: input.userEmail,
          hubspot_owner_id: input.userId,
          associated_object_type: input.association?.objectType ?? "",
          associated_object_id: input.association?.objectId ?? "",
          associated_object_label: input.association?.label ?? "",
          associated_task_id: input.taskAssociation?.objectId ?? "",
          associated_task_label: input.taskAssociation?.label ?? "",
        },
        ...(input.association || input.taskAssociation
          ? {
              associations: [
                ...(input.association
                  ? [
                      {
                        objectTypeId: input.association.objectTypeId,
                        objectId: input.association.objectId,
                      },
                    ]
                  : []),
                ...(input.taskAssociation
                  ? [
                      {
                        objectTypeId: input.taskAssociation.objectTypeId,
                        objectId: input.taskAssociation.objectId,
                      },
                    ]
                  : []),
              ],
            }
          : {}),
      },
    },
  );
  const entry = toTimeEntry(record);
  if (!entry) {
    throw new Error("TidsHub API returnerede en ugyldig tidsregistrering.");
  }
  return entry;
}

export async function updateTimeEntry(input: {
  portalId: number;
  entryId: string;
  ownerId: string;
  durationMinutes: number;
  category: TimeCategory;
  description?: string;
  billable: boolean;
}): Promise<TimeEntry> {
  const record = await request<TidsHubRecord>(
    `${TIDSHUB_BACKEND_URL}/api/entries/${encodeURIComponent(input.entryId)}?portalId=${input.portalId}`,
    {
      method: "PATCH",
      body: {
        ownerId: input.ownerId,
        durationMinutes: input.durationMinutes,
        category: input.category,
        description: input.description ?? "",
        billable: input.billable,
      },
    },
  );
  const entry = toTimeEntry(record);
  if (!entry) {
    throw new Error("TidsHub API returnerede en ugyldig tidsregistrering.");
  }
  return entry;
}

export async function deleteTimeEntry(input: {
  portalId: number;
  entryId: string;
  ownerId: string;
}): Promise<void> {
  await request(
    `${TIDSHUB_BACKEND_URL}/api/entries/${encodeURIComponent(input.entryId)}?portalId=${input.portalId}&ownerId=${encodeURIComponent(input.ownerId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function listHubSpotUsers(
  portalId: number,
): Promise<HubSpotUser[]> {
  const body = await request<{ results?: HubSpotUser[] }>(
    `${TIDSHUB_BACKEND_URL}/api/users?portalId=${portalId}`,
  );
  return Array.isArray(body.results) ? body.results : [];
}

export async function searchCrmAssociations(input: {
  portalId: number;
  objectType:
    | "contacts"
    | "companies"
    | "deals"
    | "tickets"
    | "projects"
    | "tasks";
  query: string;
  includeCompleted?: boolean;
}): Promise<CrmAssociationResult[]> {
  const url = new URL(`${TIDSHUB_BACKEND_URL}/api/crm/search`);
  url.searchParams.set("portalId", String(input.portalId));
  url.searchParams.set("objectType", input.objectType);
  url.searchParams.set("q", input.query);
  if (input.objectType === "tasks") {
    url.searchParams.set("includeCompleted", String(input.includeCompleted));
  }
  const body = await request<{ results?: CrmAssociationResult[] }>(
    url.toString(),
  );
  return Array.isArray(body.results) ? body.results : [];
}

export async function listAssociatedTasks(input: {
  portalId: number;
  objectType: Exclude<CrmAssociationResult["objectType"], "tasks">;
  objectId: string;
  includeCompleted: boolean;
}): Promise<CrmAssociationResult[]> {
  const url = new URL(`${TIDSHUB_BACKEND_URL}/api/crm/associated-tasks`);
  url.searchParams.set("portalId", String(input.portalId));
  url.searchParams.set("objectType", input.objectType);
  url.searchParams.set("objectId", input.objectId);
  url.searchParams.set("includeCompleted", String(input.includeCompleted));
  const body = await request<{ results?: CrmAssociationResult[] }>(
    url.toString(),
  );
  return Array.isArray(body.results) ? body.results : [];
}

export async function getApprovalSettings(
  portalId: number,
  ownerId: string,
): Promise<ApprovalSettings | null> {
  const url = new URL(`${TIDSHUB_BACKEND_URL}/api/approval-settings`);
  url.searchParams.set("portalId", String(portalId));
  url.searchParams.set("ownerId", ownerId);
  const body = await request<{ settings?: ApprovalSettings | null }>(
    url.toString(),
  );
  return body.settings ?? null;
}

export async function saveApprovalSettings(input: {
  portalId: number;
  ownerId: string;
  ownerEmail: string;
  approverId: string;
  approverEmail: string;
}): Promise<ApprovalSettings> {
  const body = await request<{ settings: ApprovalSettings }>(
    `${TIDSHUB_BACKEND_URL}/api/approval-settings?portalId=${input.portalId}`,
    { method: "PUT", body: input },
  );
  return body.settings;
}

export async function getWeekApproval(
  portalId: number,
  ownerId: string,
  weekKey: string,
): Promise<WeekApproval | null> {
  const url = new URL(`${TIDSHUB_BACKEND_URL}/api/week`);
  url.searchParams.set("portalId", String(portalId));
  url.searchParams.set("ownerId", ownerId);
  url.searchParams.set("weekKey", weekKey);
  const body = await request<{ week?: WeekApproval | null }>(url.toString());
  return body.week ?? null;
}

export async function submitWeek(input: {
  portalId: number;
  ownerId: string;
  ownerEmail: string;
  weekKey: string;
  totalMinutes: number;
}): Promise<WeekApproval> {
  const body = await request<{ week: WeekApproval }>(
    `${TIDSHUB_BACKEND_URL}/api/week/submit?portalId=${input.portalId}`,
    { method: "POST", body: input },
  );
  return body.week;
}

export async function listPendingApprovals(
  portalId: number,
  approverId: string,
): Promise<WeekApproval[]> {
  const url = new URL(`${TIDSHUB_BACKEND_URL}/api/approvals/pending`);
  url.searchParams.set("portalId", String(portalId));
  url.searchParams.set("approverId", approverId);
  const body = await request<{ results?: WeekApproval[] }>(url.toString());
  return Array.isArray(body.results) ? body.results : [];
}

export async function approveWeek(input: {
  portalId: number;
  weekId: string;
  approverId: string;
  approverEmail: string;
}): Promise<WeekApproval> {
  const body = await request<{ week: WeekApproval }>(
    `${TIDSHUB_BACKEND_URL}/api/week/approve?portalId=${input.portalId}`,
    { method: "POST", body: input },
  );
  return body.week;
}

export function humanizeApiError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return "TidsHub-backenden kunne ikke behandle anmodningen.";
}

async function request<T = unknown>(
  url: string,
  options: Parameters<typeof hubspot.fetch>[1] = {},
): Promise<T> {
  const response = await hubspot.fetch(url, options);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `TidsHub API-fejl ${response.status}`);
  }
  return body;
}

function asRecords(value: unknown): TidsHubRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TidsHubRecord[] => {
    if (!isObject(item) || !isRecordId(item.id) || !isObject(item.properties)) {
      return [];
    }
    return [
      { id: String(item.id), properties: item.properties } as TidsHubRecord,
    ];
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecordId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function categoryLabel(category: TimeCategory): string {
  return {
    project: "Projektarbejde",
    internal: "Internt arbejde",
    meeting: "Møde",
    break: "Pause",
    absence: "Fravær",
  }[category];
}
