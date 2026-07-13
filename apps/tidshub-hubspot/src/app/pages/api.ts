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
        },
      },
    },
  );
  const entry = toTimeEntry(record);
  if (!entry) {
    throw new Error("TidsHub API returnerede en ugyldig tidsregistrering.");
  }
  return entry;
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
