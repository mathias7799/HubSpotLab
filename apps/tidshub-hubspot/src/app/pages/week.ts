import type { TimeEntry, WorkNorm } from "./model.ts";

export interface IsoWeekRange {
  isoYear: number;
  isoWeek: number;
  weekKey: string;
  start: string;
  end: string;
  dates: string[];
}

export interface DaySummary {
  date: string;
  totalMinutes: number;
  billableMinutes: number;
  normMinutes: number;
  differenceMinutes: number;
  entries: TimeEntry[];
}

export interface WeekSummary {
  totalMinutes: number;
  billableMinutes: number;
  normMinutes: number;
  differenceMinutes: number;
  billablePercentage: number;
  days: DaySummary[];
}

export function isoWeekForDate(date: Date): IsoWeekRange {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  const input = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const inputWeekday = input.getUTCDay() || 7;
  input.setUTCDate(input.getUTCDate() - inputWeekday + 1);

  const dates = Array.from({ length: 7 }, (_, index) =>
    addUtcDays(input, index),
  );
  return {
    isoYear,
    isoWeek,
    weekKey: `${String(isoYear)}-W${String(isoWeek).padStart(2, "0")}`,
    start: dates[0] as string,
    end: dates[6] as string,
    dates,
  };
}

export function shiftIsoWeek(range: IsoWeekRange, weeks: number): IsoWeekRange {
  const start = parseDate(range.start);
  start.setUTCDate(start.getUTCDate() + weeks * 7);
  return isoWeekForDate(start);
}

export function summarizeWeek(
  entries: TimeEntry[],
  range: IsoWeekRange,
  norm: WorkNorm,
): WeekSummary {
  const days = range.dates.map((date, index): DaySummary => {
    const dayEntries = entries.filter((entry) => entry.entryDate === date);
    const totalMinutes = sum(dayEntries.map((entry) => entry.durationMinutes));
    const billableMinutes = sum(
      dayEntries
        .filter((entry) => entry.billable)
        .map((entry) => entry.durationMinutes),
    );
    const normMinutes = norm.dailyMinutes[index + 1] ?? 0;

    return {
      date,
      totalMinutes,
      billableMinutes,
      normMinutes,
      differenceMinutes: totalMinutes - normMinutes,
      entries: dayEntries,
    };
  });

  const totalMinutes = sum(days.map((day) => day.totalMinutes));
  const billableMinutes = sum(days.map((day) => day.billableMinutes));

  return {
    totalMinutes,
    billableMinutes,
    normMinutes: norm.weeklyMinutes,
    differenceMinutes: totalMinutes - norm.weeklyMinutes,
    billablePercentage:
      totalMinutes === 0
        ? 0
        : Math.round((billableMinutes / totalMinutes) * 100),
    days,
  };
}

export function formatMinutes(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(totalMinutes));
  return `${sign}${String(Math.floor(absolute / 60))}t ${String(absolute % 60)}m`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDateFromInput(
  value:
    | string
    | { year: number; month: number; date: number }
    | null
    | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }
  const date = new Date(Date.UTC(value.year, value.month, value.date));
  if (
    date.getUTCFullYear() !== value.year ||
    date.getUTCMonth() !== value.month ||
    date.getUTCDate() !== value.date
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
