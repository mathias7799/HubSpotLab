import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  ButtonRow,
  DescriptionList,
  DescriptionListItem,
  EmptyState,
  Flex,
  Form,
  LoadingSpinner,
  NumberInput,
  Select,
  Text,
  TextArea,
  hubspot,
  useExtensionActions,
  useExtensionContext,
} from "@hubspot/ui-extensions";
import type { FormSubmitExtensionEvent } from "@hubspot/ui-extensions";
import { useAssociations } from "@hubspot/ui-extensions/crm";
import { ensureSchema } from "./ensureSchema.ts";

const BACKEND_URL =
  "https://c00cc054661d9a6c-185-229-152-184.serveousercontent.com";

interface FormValues {
  durationMinutes?: string | number;
  category?: string | number;
  billable?: string | number;
  description?: string | number;
}

interface CardEntry {
  id: string;
  entryDate: string;
  durationMinutes: number;
  description: string;
  billable: boolean;
}

const categoryOptions = [
  { label: "Projektarbejde", value: "project" },
  { label: "Internt arbejde", value: "internal" },
  { label: "Møde", value: "meeting" },
  { label: "Pause", value: "break" },
];

hubspot.extend<"crm.record.sidebar">(() => <TidsHubCard />);

function TidsHubCard(): React.ReactElement {
  const context = useExtensionContext<"crm.record.sidebar">();
  const [objectType, setObjectType] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  useEffect(() => {
    void ensureSchema(context.portal.id)
      .then((schema) => setObjectType(schema.fullyQualifiedName))
      .catch((cause: unknown) => {
        setSchemaError(
          cause instanceof Error
            ? cause.message
            : "TidsHub-objektet kunne ikke initialiseres.",
        );
      });
  }, [context.portal.id]);

  if (schemaError) {
    return (
      <Alert title="TidsHub" variant="danger">
        {schemaError}
      </Alert>
    );
  }
  if (!objectType) {
    return <LoadingSpinner label="Initialiserer TidsHub" />;
  }
  return <TidsHubReadyCard objectType={objectType} />;
}

function TidsHubReadyCard({
  objectType,
}: {
  objectType: string;
}): React.ReactElement {
  const context = useExtensionContext<"crm.record.sidebar">();
  const actions = useExtensionActions<"crm.record.sidebar">();
  const [saving, setSaving] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [optimisticEntries, setOptimisticEntries] = useState<CardEntry[]>([]);
  const associations = useAssociations({
    toObjectType: objectType,
    properties: [
      "record_kind",
      "entry_date",
      "duration_minutes",
      "description",
      "billable",
    ],
    pageLength: 100,
  });

  useEffect(() => {
    void associations.refetch();
    // The hook object is recreated by the renderer; the mount-only refetch is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekStart = currentWeekStart();
  const weekEnd = currentWeekEnd();
  const associatedEntries = useMemo(
    () =>
      associations.results
        .filter(
          (result) =>
            result.properties.record_kind === "time_entry" &&
            (result.properties.entry_date ?? "") >= weekStart &&
            (result.properties.entry_date ?? "") <= weekEnd,
        )
        .map((result) => ({
          id: String(result.toObjectId),
          entryDate: result.properties.entry_date ?? "",
          durationMinutes: Number(result.properties.duration_minutes ?? 0),
          description: result.properties.description ?? "",
          billable: result.properties.billable === "true",
        })),
    [associations.results, weekEnd, weekStart],
  );
  const entries = useMemo(() => {
    const associatedIds = new Set(associatedEntries.map((entry) => entry.id));
    return [
      ...optimisticEntries.filter((entry) => !associatedIds.has(entry.id)),
      ...associatedEntries,
    ];
  }, [associatedEntries, optimisticEntries]);
  const totalMinutes = entries.reduce(
    (total, entry) => total + entry.durationMinutes,
    0,
  );
  const billableMinutes = entries
    .filter((entry) => entry.billable)
    .reduce((total, entry) => total + entry.durationMinutes, 0);

  async function createEntry(
    event: FormSubmitExtensionEvent<FormValues>,
  ): Promise<void> {
    const values = event.targetValue;
    const durationMinutes = Number(values.durationMinutes ?? 0);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setError("Angiv et positivt helt antal minutter.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const created = await hubspot.fetch(
        `${BACKEND_URL}/api/entries?portalId=${context.portal.id}`,
        {
          method: "POST",
          body: {
            properties: {
              record_name: `${today} - ${stringValue(values.description) ?? "CRM-arbejde"}`,
              record_kind: "time_entry",
              week_key: currentWeekKey(),
              entry_date: today,
              duration_minutes: String(durationMinutes),
              category: String(values.category ?? "project"),
              billable: String(values.billable ?? "true"),
              description: stringValue(values.description) ?? "",
              record_status: "draft",
              hubspot_user_id: String(context.user.id),
              hubspot_user_email: context.user.email,
              hubspot_owner_id: String(context.user.id),
            },
            ...(context.crm
              ? {
                  association: {
                    objectTypeId: context.crm.objectTypeId,
                    objectId: String(context.crm.objectId),
                  },
                }
              : {}),
          },
        },
      );
      const createdBody = (await created.json()) as unknown;
      if (
        !created.ok ||
        !isObject(createdBody) ||
        !isRecordId(createdBody.id)
      ) {
        throw new Error(apiMessage(created.status, createdBody));
      }

      setOptimisticEntries((current) => [
        {
          id: String(createdBody.id),
          entryDate: today,
          durationMinutes,
          description: stringValue(values.description) ?? "",
          billable: String(values.billable ?? "true") === "true",
        },
        ...current,
      ]);

      await associations.refetch();
      setFormVersion((version) => version + 1);
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: "Tiden er registreret.",
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Tiden kunne ikke gemmes.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Flex direction="column" gap="medium">
      {error ? (
        <Alert title="TidsHub" variant="danger">
          {error}
        </Alert>
      ) : null}

      <DescriptionList direction="row">
        <DescriptionListItem label="Denne uge">
          {formatMinutes(totalMinutes)}
        </DescriptionListItem>
        <DescriptionListItem label="Fakturerbar">
          {formatMinutes(billableMinutes)}
        </DescriptionListItem>
      </DescriptionList>

      <Form key={formVersion} onSubmit={createEntry}>
        <Flex direction="column" gap="small">
          <NumberInput
            name="durationMinutes"
            label="Minutter"
            min={1}
            defaultValue={30}
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
            options={[
              { label: "Fakturerbar", value: "true" },
              { label: "Ikke fakturerbar", value: "false" },
            ]}
          />
          <TextArea
            name="description"
            label="Beskrivelse"
            rows={2}
            resize="vertical"
          />
          <ButtonRow>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Gemmer..." : "Gem tid"}
            </Button>
            <Button
              onClick={() => void associations.refetch()}
              disabled={saving || associations.isRefetching}
            >
              Opdater
            </Button>
          </ButtonRow>
        </Flex>
      </Form>

      {entries.length === 0 ? (
        <EmptyState
          title="Ingen registreringer på posten i denne uge"
          layout="vertical"
        >
          <Text>Opret den første registrering med formularen ovenfor.</Text>
        </EmptyState>
      ) : (
        <Flex direction="column" gap="small">
          {entries.slice(0, 5).map((entry) => (
            <Text key={entry.id}>
              {entry.entryDate}: {formatMinutes(entry.durationMinutes)}
              {entry.description ? ` - ${entry.description}` : ""}
            </Text>
          ))}
        </Flex>
      )}
    </Flex>
  );
}

function currentWeekStart(): string {
  const today = new Date();
  const date = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function currentWeekKey(): string {
  const today = new Date();
  const date = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - start.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${String(year)}-W${String(week).padStart(2, "0")}`;
}

function currentWeekEnd(): string {
  const start = new Date(`${currentWeekStart()}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + 6);
  return start.toISOString().slice(0, 10);
}

function formatMinutes(value: number): string {
  const minutes = Math.max(0, Math.round(value));
  return `${String(Math.floor(minutes / 60))}t ${String(minutes % 60)}m`;
}

function stringValue(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function apiMessage(status: number, body: unknown): string {
  if (isObject(body) && typeof body.message === "string") return body.message;
  if (isObject(body) && typeof body.error === "string") return body.error;
  return `HubSpot API-fejl ${status}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecordId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}
