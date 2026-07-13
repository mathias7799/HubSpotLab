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

import { ApprovalPanel, WeekSubmissionBar } from "./ApprovalPanel.tsx";
import { AssociationPicker } from "./AssociationPicker.tsx";
import {
  approveWeek,
  createTimeEntry,
  deleteTimeEntry,
  getApprovalSettings,
  getWeekApproval,
  humanizeApiError,
  listHubSpotUsers,
  listPendingApprovals,
  saveApprovalSettings,
  searchTimeEntries,
  submitWeek,
  updateTimeEntry,
  type ApprovalSettings,
  type CrmAssociationResult,
  type HubSpotUser,
  type WeekApproval,
} from "./api.ts";
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

interface EditEntryFormValues {
  durationMinutes?: string | number;
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
  const [association, setAssociation] = useState<CrmAssociationResult | null>(
    null,
  );
  const [taskAssociation, setTaskAssociation] =
    useState<CrmAssociationResult | null>(null);
  const [approvalSettings, setApprovalSettings] =
    useState<ApprovalSettings | null>(null);
  const [weekApproval, setWeekApproval] = useState<WeekApproval | null>(null);
  const [users, setUsers] = useState<HubSpotUser[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<WeekApproval[]>([]);
  const [selectedApproverId, setSelectedApproverId] = useState("");

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
      const nextEntries = await searchTimeEntries(range, portalId, userId);
      const [nextSettings, nextWeek, nextUsers, nextPending] =
        await Promise.all([
          getApprovalSettings(portalId, userId),
          getWeekApproval(portalId, userId, range.weekKey),
          listHubSpotUsers(portalId),
          listPendingApprovals(portalId, userId),
        ]);
      setEntries(nextEntries);
      setApprovalSettings(nextSettings);
      setWeekApproval(nextWeek);
      setUsers(nextUsers);
      setPendingApprovals(nextPending);
      setSelectedApproverId(nextSettings?.approverId ?? "");
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
        ...(association
          ? {
              association: {
                objectTypeId: association.objectTypeId,
                objectId: association.id,
                objectType: association.objectType,
                label: association.label,
              },
            }
          : {}),
        ...(taskAssociation?.objectType === "tasks"
          ? {
              taskAssociation: {
                objectType: "tasks" as const,
                objectTypeId: taskAssociation.objectTypeId,
                objectId: taskAssociation.id,
                label: taskAssociation.label,
              },
            }
          : {}),
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
      setAssociation(null);
      setTaskAssociation(null);
      setSelectedTab("overview");
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
    }
  }

  async function handleUpdateEntry(input: {
    entryId: string;
    durationMinutes: number;
    category: TimeCategory;
    description?: string;
    billable: boolean;
  }): Promise<void> {
    setState("saving");
    setError(null);
    try {
      const updated = await updateTimeEntry({
        portalId,
        ownerId: userId,
        ...input,
      });
      setEntries((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: "Tidsregistreringen er opdateret.",
      });
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
      throw cause;
    }
  }

  async function handleDeleteEntry(entryId: string): Promise<void> {
    setState("saving");
    setError(null);
    try {
      await deleteTimeEntry({ portalId, entryId, ownerId: userId });
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: "Tidsregistreringen er slettet.",
      });
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
      throw cause;
    }
  }

  async function handleSaveApprover(): Promise<void> {
    const approver = users.find((user) => user.id === selectedApproverId);
    if (!approver) {
      setError("Vælg en gyldig godkendelsesansvarlig.");
      return;
    }
    setState("saving");
    setError(null);
    try {
      const settings = await saveApprovalSettings({
        portalId,
        ownerId: userId,
        ownerEmail: userEmail,
        approverId: approver.id,
        approverEmail: approver.email,
      });
      setApprovalSettings(settings);
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: "Godkendelsesansvarlig er gemt.",
      });
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
    }
  }

  async function handleSubmitWeek(): Promise<void> {
    setState("saving");
    setError(null);
    try {
      const week = await submitWeek({
        portalId,
        ownerId: userId,
        ownerEmail: userEmail,
        weekKey: range.weekKey,
        totalMinutes: summary.totalMinutes,
      });
      setWeekApproval(week);
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: "Ugen er sendt til godkendelse.",
      });
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
    }
  }

  async function handleApproveWeek(week: WeekApproval): Promise<void> {
    setState("saving");
    setError(null);
    try {
      await approveWeek({
        portalId,
        weekId: week.id,
        approverId: userId,
        approverEmail: userEmail,
      });
      setPendingApprovals((current) =>
        current.filter((pending) => pending.id !== week.id),
      );
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: `${week.ownerEmail}s uge er godkendt.`,
      });
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(humanizeApiError(cause));
    }
  }

  const busy = state === "loading" || state === "saving";
  const weekLocked = ["submitted", "approved"].includes(
    weekApproval?.status ?? "draft",
  );
  const defaultEntryDate = range.dates.includes(todayIsoDate())
    ? todayIsoDate()
    : range.start;
  const tabsKey = `${range.weekKey}:${state}:${entries
    .map((entry) => entry.id)
    .join(",")}:${weekApproval?.status ?? "draft"}:${pendingApprovals.length}`;

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

      <WeekSubmissionBar
        week={weekApproval}
        settings={approvalSettings}
        hasEntries={entries.length > 0}
        busy={busy}
        onSubmit={handleSubmitWeek}
      />

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
            locked={weekLocked}
            busy={busy}
            onRegister={() => setSelectedTab("register")}
            onUpdate={handleUpdateEntry}
            onDelete={handleDeleteEntry}
          />
        </Tab>
        <Tab tabId="register" title="Registrer tid">
          <Heading>Ny tidsregistrering</Heading>
          {weekLocked ? (
            <Alert title="Ugen er låst" variant="warning">
              Ugen er indsendt og kan ikke modtage flere registreringer.
            </Alert>
          ) : null}
          <Form key={formVersion} onSubmit={handleCreate}>
            <Flex direction="column" gap="small">
              <DateInput
                name="entryDate"
                label="Dato"
                format="YYYY-MM-DD"
                defaultValue={dateInputValue(defaultEntryDate)}
                readOnly={weekLocked}
                required
              />
              <StepperInput
                name="durationMinutes"
                label="Varighed (minutter)"
                description="Brug plus og minus til intervaller på 15 minutter."
                min={1}
                stepSize={15}
                defaultValue={30}
                readOnly={weekLocked}
                required
              />
              <Select
                name="category"
                label="Kategori"
                value="project"
                options={categoryOptions}
                readOnly={weekLocked}
              />
              <Select
                name="billable"
                label="Fakturering"
                value="true"
                options={billableOptions}
                readOnly={weekLocked}
              />
              <TextArea
                name="description"
                label="Beskrivelse"
                rows={3}
                resize="vertical"
                readOnly={weekLocked}
              />
              <AssociationPicker
                portalId={portalId}
                selected={association}
                disabled={busy || weekLocked}
                onSelectedChange={setAssociation}
              />
              <AssociationPicker
                portalId={portalId}
                selected={taskAssociation}
                disabled={busy || weekLocked}
                kind="task"
                onSelectedChange={setTaskAssociation}
              />
              <ButtonRow>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy || weekLocked}
                >
                  {state === "saving" ? "Gemmer..." : "Gem tid"}
                </Button>
              </ButtonRow>
            </Flex>
          </Form>
        </Tab>
        <Tab tabId="approvals" title="Godkendelser">
          <ApprovalPanel
            users={users}
            currentUserId={userId}
            settings={approvalSettings}
            selectedApproverId={selectedApproverId}
            pending={pendingApprovals}
            busy={busy}
            onApproverChange={setSelectedApproverId}
            onSaveApprover={handleSaveApprover}
            onApprove={handleApproveWeek}
          />
        </Tab>
      </Tabs>
    </Flex>
  );
}

function WeekTable({
  range,
  entries,
  locked,
  busy,
  onRegister,
  onUpdate,
  onDelete,
}: {
  range: IsoWeekRange;
  entries: TimeEntry[];
  locked: boolean;
  busy: boolean;
  onRegister: () => void;
  onUpdate: (input: {
    entryId: string;
    durationMinutes: number;
    category: TimeCategory;
    description?: string;
    billable: boolean;
  }) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
}): React.ReactElement {
  const summary = summarizeWeek(entries, range, defaultNorm);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDay = summary.days.find((day) => day.date === selectedDate);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Ingen tidsregistreringer i denne uge"
        layout="vertical"
      >
        <Text>
          Brug fanen Registrer tid til at oprette ugens første registrering.
        </Text>
        <Button variant="primary" onClick={onRegister} disabled={locked}>
          Registrer tid
        </Button>
      </EmptyState>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      <Table bordered density="compact">
        <TableHead>
          <TableRow>
            <TableHeader>Dag</TableHeader>
            <TableHeader>Registreret</TableHeader>
            <TableHeader>Norm</TableHeader>
            <TableHeader>Fakturerbar</TableHeader>
            <TableHeader>Registreringer</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Detaljer</TableHeader>
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
                <TableCell>{day.entries.length}</TableCell>
                <TableCell>
                  <StatusTag variant={status.variant}>{status.label}</StatusTag>
                </TableCell>
                <TableCell>
                  <Button
                    size="xs"
                    variant="transparent"
                    onClick={() =>
                      setSelectedDate((current) =>
                        current === day.date ? null : day.date,
                      )
                    }
                  >
                    {selectedDate === day.date ? "Skjul" : "Vis dag"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {selectedDay ? (
        <DayDetails
          day={selectedDay}
          locked={locked}
          busy={busy}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ) : null}
    </Flex>
  );
}

function DayDetails({
  day,
  locked,
  busy,
  onUpdate,
  onDelete,
}: {
  day: DaySummary;
  locked: boolean;
  busy: boolean;
  onUpdate: (input: {
    entryId: string;
    durationMinutes: number;
    category: TimeCategory;
    description?: string;
    billable: boolean;
  }) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
}): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const editingEntry = day.entries.find((entry) => entry.id === editingId);
  const deletingEntry = day.entries.find((entry) => entry.id === deletingId);
  const [editCategory, setEditCategory] = useState<TimeCategory>("project");
  const [editBillable, setEditBillable] = useState("true");
  const [editDescription, setEditDescription] = useState("");

  function beginEdit(entry: TimeEntry): void {
    setDeletingId(null);
    setEditingId(entry.id);
    setEditCategory(entry.category);
    setEditBillable(String(entry.billable));
    setEditDescription(entry.description ?? "");
  }

  async function submitEdit(
    event: FormSubmitExtensionEvent<EditEntryFormValues>,
  ): Promise<void> {
    if (!editingEntry) return;
    const durationMinutes = Number(event.targetValue.durationMinutes ?? 0);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return;
    try {
      await onUpdate({
        entryId: editingEntry.id,
        durationMinutes,
        category: editCategory,
        description: stringValue(editDescription),
        billable: editBillable === "true",
      });
      setEditingId(null);
    } catch {
      // The parent renders the backend error and keeps the editor open.
    }
  }

  return (
    <Flex direction="column" gap="small">
      <Heading>{formatDate(day.date)}</Heading>
      <Text>
        {formatMinutes(day.totalMinutes)} registreret, heraf{" "}
        {formatMinutes(day.billableMinutes)} fakturerbar.
      </Text>
      {day.entries.length === 0 ? (
        <EmptyState title="Ingen registreringer denne dag" layout="vertical">
          <Text>Vælg Registrer tid for at tilføje dagens første post.</Text>
        </EmptyState>
      ) : (
        <Table bordered density="compact">
          <TableHead>
            <TableRow>
              <TableHeader>Varighed</TableHeader>
              <TableHeader>Kategori</TableHeader>
              <TableHeader>Beskrivelse</TableHeader>
              <TableHeader>Fakturering</TableHeader>
              <TableHeader>Tilknytning</TableHeader>
              <TableHeader>Handlinger</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {day.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatMinutes(entry.durationMinutes)}</TableCell>
                <TableCell>{categoryLabel(entry.category)}</TableCell>
                <TableCell>{entry.description ?? "-"}</TableCell>
                <TableCell>
                  <StatusTag variant={entry.billable ? "success" : "default"}>
                    {entry.billable ? "Fakturerbar" : "Ikke fakturerbar"}
                  </StatusTag>
                </TableCell>
                <TableCell>{associationLabels(entry)}</TableCell>
                <TableCell>
                  <ButtonRow>
                    <Button
                      type="button"
                      size="xs"
                      variant="transparent"
                      disabled={locked || busy}
                      onClick={() => beginEdit(entry)}
                    >
                      Rediger
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="transparent"
                      disabled={locked || busy}
                      onClick={() => {
                        setEditingId(null);
                        setDeletingId(entry.id);
                      }}
                    >
                      Slet
                    </Button>
                  </ButtonRow>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editingEntry ? (
        <Flex direction="column" gap="small">
          <Heading>Rediger registrering</Heading>
          <Form key={editingEntry.id} onSubmit={submitEdit}>
            <Flex direction="column" gap="small">
              <StepperInput
                name="durationMinutes"
                label="Varighed (minutter)"
                min={1}
                stepSize={15}
                defaultValue={editingEntry.durationMinutes}
                required
              />
              <Select
                name="category"
                label="Kategori"
                value={editCategory}
                options={categoryOptions}
                onChange={(value) =>
                  setEditCategory(String(value) as TimeCategory)
                }
              />
              <Select
                name="billable"
                label="Fakturering"
                value={editBillable}
                options={billableOptions}
                onChange={(value) => setEditBillable(String(value))}
              />
              <TextArea
                name="description"
                label="Beskrivelse"
                rows={3}
                resize="vertical"
                value={editDescription}
                onInput={(value) => setEditDescription(String(value))}
                onChange={(value) => setEditDescription(String(value))}
              />
              <ButtonRow>
                <Button type="submit" variant="primary" disabled={busy}>
                  Gem ændringer
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingId(null)}
                >
                  Annuller
                </Button>
              </ButtonRow>
            </Flex>
          </Form>
        </Flex>
      ) : null}
      {deletingEntry ? (
        <Alert title="Slet tidsregistrering?" variant="warning">
          <Flex direction="column" gap="small">
            <Text>
              {formatMinutes(deletingEntry.durationMinutes)} slettes permanent
              fra {formatDate(deletingEntry.entryDate)}.
            </Text>
            <ButtonRow>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  void onDelete(deletingEntry.id)
                    .then(() => setDeletingId(null))
                    .catch(() => undefined);
                }}
              >
                Slet permanent
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => setDeletingId(null)}
              >
                Behold registrering
              </Button>
            </ButtonRow>
          </Flex>
        </Alert>
      ) : null}
    </Flex>
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

function associationLabels(entry: TimeEntry): string {
  const labels = [
    entry.associationLabel ? `CRM: ${entry.associationLabel}` : null,
    entry.taskAssociationLabel ? `Opgave: ${entry.taskAssociationLabel}` : null,
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(" / ") : "-";
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
