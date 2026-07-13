export const recordProperties = [
  "record_name",
  "record_kind",
  "week_key",
  "entry_date",
  "started_at",
  "ended_at",
  "duration_minutes",
  "category",
  "registration_type",
  "description",
  "billable",
  "hourly_rate",
  "record_status",
  "weekly_minutes",
  "valid_from",
  "valid_to",
  "monday_minutes",
  "tuesday_minutes",
  "wednesday_minutes",
  "thursday_minutes",
  "friday_minutes",
  "saturday_minutes",
  "sunday_minutes",
  "submitted_at",
  "approved_at",
  "manager_comment",
  "hubspot_user_id",
  "hubspot_user_email",
  "hubspot_owner_id",
] as const;

export type RecordProperty = (typeof recordProperties)[number];

export type TimeCategory =
  | "project"
  | "internal"
  | "meeting"
  | "break"
  | "absence";
export type RecordKind = "time_entry" | "week" | "norm";

export interface TidsHubRecord {
  id: string;
  properties: Partial<Record<RecordProperty, string | null>>;
}

export interface TimeEntry {
  id: string;
  entryDate: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
  category: TimeCategory;
  registrationType: string | null;
  description: string | null;
  billable: boolean;
  status: string;
}

export interface WorkNorm {
  weeklyMinutes: number;
  dailyMinutes: Record<number, number>;
}

export const defaultNorm: WorkNorm = {
  weeklyMinutes: 37 * 60,
  dailyMinutes: {
    1: 7 * 60 + 24,
    2: 7 * 60 + 24,
    3: 7 * 60 + 24,
    4: 7 * 60 + 24,
    5: 7 * 60 + 24,
    6: 0,
    7: 0,
  },
};

export function toTimeEntry(record: TidsHubRecord): TimeEntry | null {
  const properties = record.properties;
  if (properties.record_kind !== "time_entry" || !properties.entry_date)
    return null;

  const durationMinutes = Number(properties.duration_minutes ?? 0);
  if (!Number.isFinite(durationMinutes)) return null;

  return {
    id: record.id,
    entryDate: properties.entry_date,
    startedAt: properties.started_at ?? null,
    endedAt: properties.ended_at ?? null,
    durationMinutes,
    category: isTimeCategory(properties.category)
      ? properties.category
      : "internal",
    registrationType: properties.registration_type ?? null,
    description: properties.description ?? null,
    billable: properties.billable === "true",
    status: properties.record_status ?? "draft",
  };
}

function isTimeCategory(
  value: string | null | undefined,
): value is TimeCategory {
  return ["project", "internal", "meeting", "break", "absence"].includes(
    value ?? "",
  );
}
