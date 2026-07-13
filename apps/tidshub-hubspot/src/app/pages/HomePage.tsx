import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  ButtonRow,
  DateInput,
  EmptyState,
  Flex,
  Form,
  Heading,
  LoadingSpinner,
  Select,
  Statistics,
  StatisticsItem,
  StepperInput,
  StatusTag,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Text,
  TextArea,
  useExtensionActions,
  useExtensionContext,
} from "@hubspot/ui-extensions";
import type { FormSubmitExtensionEvent } from "@hubspot/ui-extensions";
import type { BaseDate } from "@hubspot/ui-extensions";
import { PageBreadcrumbs, PageTitle } from "@hubspot/ui-extensions/pages";

import { createTimeEntry, humanizeApiError, searchTimeEntries } from "./api.ts";
import { defaultNorm, type TimeCategory, type TimeEntry } from "./model.ts";
import {
  formatMinutes,
  isoDateFromInput,
  isoWeekForDate,
  shiftIsoWeek,
  summarizeWeek,
  todayIsoDate,
  type DaySummary,
  type IsoWeekRange,
} from "./week.ts";

type LoadState = "loading" | "idle" | "saving" | "error";

interface EntryFormValues {
  entryDate?: BaseDate | string | null;
  durationMinutes?: string | number;
  category?: string | number;
  billable?: string | number;
  description?: string | number;
}

const categoryOptions = [
  { label: "Projektarbejde", value: "project" },
  { label: "Internt arbejde", value: "internal" },
  { label: "Møde", value: "meeting" },
  { label: "Pause", value: "break" },
  { label: "Fravær", value: "absence" },
];

const billableOptions = [
  { label: "Fakturerbar", value: "true" },
  { label: "Ikke fakturerbar", value: "false" },
];

export function HomePage(): React.ReactElement {
  const context = useExtensionContext<"pages">();
  const actions = useExtensionActions<"pages">();
  const [range, setRange] = useState<IsoWeekRange>(() =>
    isoWeekForDate(new Date()),
  );
  const [state, setState] = useState<LoadState>("loading");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [formVersion, setFormVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const userId = String(context.user.id);
  const userEmail = context.user.email;
  const portalId = context.portal.id;
  const summary = useMemo(
    () => summarizeWeek(entries, range, defaultNorm),
    [entries, range],
  );

  const refresh = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      setEntries(await searchTimeEntries(range, portalId, userId));
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
    }
  }, [portalId, range, userId]);

  useEffect(() => {
    // Initial and week-change loading is the external synchronization this effect owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function handleCreate(
    event: FormSubmitExtensionEvent<EntryFormValues>,
  ): Promise<void> {
    const values = event.targetValue;
    const entryDate = isoDateFromInput(values.entryDate);
    const durationMinutes = Number(values.durationMinutes ?? 0);
    const category = String(values.category ?? "internal") as TimeCategory;

    if (!entryDate) {
      setError("Vælg en gyldig dato.");
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setError("Angiv et positivt helt antal minutter.");
      return;
    }

    setState("saving");
    setError(null);
    try {
      const created = await createTimeEntry({
        portalId,
        userId,
        userEmail,
        entryDate,
        durationMinutes,
        category,
        description: stringValue(values.description),
        billable: String(values.billable ?? "false") === "true",
        weekKey: isoWeekForDate(new Date(`${entryDate}T12:00:00.000Z`)).weekKey,
      });
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: "Tidsregistreringen er gemt.",
      });
      if (created.entryDate >= range.start && created.entryDate <= range.end) {
        setEntries((current) => [created, ...current]);
      }
      setFormVersion((version) => version + 1);
      setSelectedTab("overview");
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
    }
  }

  const busy = state === "loading" || state === "saving";
  const defaultEntryDate = range.dates.includes(todayIsoDate())
    ? todayIsoDate()
    : range.start;
  const tabsKey = `${range.weekKey}:${state}:${entries
    .map((entry) => entry.id)
    .join(",")}`;

  return (
    <Flex direction="column" gap="medium">
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Ugeoverblik</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Min uge</PageTitle>

      {error ? (
        <Alert title="TidsHub" variant="danger">
          {error}
        </Alert>
      ) : null}

      <Flex direction="row" gap="small" align="center">
        <Button
          onClick={() => setRange((current) => shiftIsoWeek(current, -1))}
          disabled={busy}
        >
          Forrige uge
        </Button>
        <StatusTag variant="default">{range.weekKey}</StatusTag>
        <Button
          onClick={() => setRange(isoWeekForDate(new Date()))}
          disabled={busy}
        >
          Denne uge
        </Button>
        <Button
          onClick={() => setRange((current) => shiftIsoWeek(current, 1))}
          disabled={busy}
        >
          Næste uge
        </Button>
        <Button onClick={refresh} disabled={busy}>
          Opdater
        </Button>
      </Flex>

      {state === "loading" ? (
        <Flex direction="row" gap="small" align="center">
          <LoadingSpinner label="Indlæser uge" />
          <Text>Indlæser uge...</Text>
        </Flex>
      ) : null}

      <Statistics>
        <StatisticsItem
          id="registered"
          label="Registreret"
          number={formatMinutes(summary.totalMinutes)}
        />
        <StatisticsItem
          id="norm"
          label="Ugens norm"
          number={formatMinutes(summary.normMinutes)}
        />
        <StatisticsItem
          id="difference"
          label="Resterende"
          number={formatMinutes(Math.abs(summary.differenceMinutes))}
        >
          <Text>
            {summary.differenceMinutes >= 0
              ? "Normen er nået"
              : "Til ugens norm"}
          </Text>
        </StatisticsItem>
        <StatisticsItem
          id="billable"
          label="Fakturerbar"
          number={formatMinutes(summary.billableMinutes)}
        >
          <Text>{summary.billablePercentage}% af registreret tid</Text>
        </StatisticsItem>
      </Statistics>

      <Tabs
        key={tabsKey}
        selected={selectedTab}
        onSelectedChange={(tabId: string | number) =>
          setSelectedTab(String(tabId))
        }
      >
        <Tab tabId="overview" title="Ugeoverblik">
          <WeekTable
            range={range}
            entries={entries}
            onRegister={() => setSelectedTab("register")}
          />
        </Tab>
        <Tab tabId="register" title="Registrer tid">
          <Heading>Ny tidsregistrering</Heading>
          <Form key={formVersion} onSubmit={handleCreate}>
            <Flex direction="column" gap="small">
              <DateInput
                name="entryDate"
                label="Dato"
                format="YYYY-MM-DD"
                defaultValue={dateInputValue(defaultEntryDate)}
                required
              />
              <StepperInput
                name="durationMinutes"
                label="Varighed (minutter)"
                description="Brug plus og minus til intervaller på 15 minutter."
                min={1}
                stepSize={15}
                defaultValue={30}
                required
              />
              <Select
                name="category"
                label="Kategori"
                value="project"
                options={categoryOptions}
              />
              <Select
                name="billable"
                label="Fakturering"
                value="true"
                options={billableOptions}
              />
              <TextArea
                name="description"
                label="Beskrivelse"
                rows={3}
                resize="vertical"
              />
              <ButtonRow>
                <Button type="submit" variant="primary" disabled={busy}>
                  {state === "saving" ? "Gemmer..." : "Gem tid"}
                </Button>
              </ButtonRow>
            </Flex>
          </Form>
        </Tab>
      </Tabs>
    </Flex>
  );
}

function WeekTable({
  range,
  entries,
  onRegister,
}: {
  range: IsoWeekRange;
  entries: TimeEntry[];
  onRegister: () => void;
}): React.ReactElement {
  const summary = summarizeWeek(entries, range, defaultNorm);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Ingen tidsregistreringer i denne uge"
        layout="vertical"
      >
        <Text>
          Brug fanen Registrer tid til at oprette ugens første registrering.
        </Text>
        <Button variant="primary" onClick={onRegister}>
          Registrer tid
        </Button>
      </EmptyState>
    );
  }

  return (
    <Table bordered density="compact">
      <TableHead>
        <TableRow>
          <TableHeader>Dag</TableHeader>
          <TableHeader>Registreret</TableHeader>
          <TableHeader>Norm</TableHeader>
          <TableHeader>Fakturerbar</TableHeader>
          <TableHeader>Detaljer</TableHeader>
          <TableHeader>Status</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {summary.days.map((day) => {
          const status = dayStatus(day);
          return (
            <TableRow key={day.date}>
              <TableCell>{formatDate(day.date)}</TableCell>
              <TableCell>{formatMinutes(day.totalMinutes)}</TableCell>
              <TableCell>{formatMinutes(day.normMinutes)}</TableCell>
              <TableCell>{formatMinutes(day.billableMinutes)}</TableCell>
              <TableCell>
                {day.entries.length === 0 ? (
                  <Text>-</Text>
                ) : (
                  <Flex direction="column" gap="flush">
                    {day.entries.slice(0, 3).map((entry) => (
                      <Text key={entry.id}>
                        {formatMinutes(entry.durationMinutes)}:{" "}
                        {entry.description ?? categoryLabel(entry.category)}
                      </Text>
                    ))}
                    {day.entries.length > 3 ? (
                      <Text>+ {day.entries.length - 3} flere</Text>
                    ) : null}
                  </Flex>
                )}
              </TableCell>
              <TableCell>
                <StatusTag variant={status.variant}>{status.label}</StatusTag>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function stringValue(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
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

function dayStatus(day: DaySummary): {
  label: string;
  variant: "default" | "success";
} {
  if (day.normMinutes === 0) {
    return {
      label: day.totalMinutes > 0 ? "Ekstra tid" : "Fridag",
      variant: "default",
    };
  }
  return day.totalMinutes >= day.normMinutes
    ? { label: "Færdig", variant: "success" }
    : { label: "Mangler tid", variant: "default" };
}

function dateInputValue(value: string): BaseDate {
  const [year, month, date] = value.split("-").map(Number);
  return {
    year: year as number,
    month: (month as number) - 1,
    date: date as number,
  };
}
