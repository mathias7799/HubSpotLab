import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  Heading,
  Input,
  LoadingSpinner,
  MultiSelect,
  Select,
  Text,
  hubspot,
  useExtensionContext,
} from "@hubspot/ui-extensions";

import { API_ORIGIN } from "./backend.ts";

interface AppSettings {
  enabled: boolean;
  requiredProperties: string[];
  requireCompany: boolean;
  requireContact: boolean;
  ticketPipelineId: string;
  ticketStageId: string;
  ticketSubjectPrefix: string;
}

interface TicketPipeline {
  id: string;
  label: string;
  stages: Array<{ id: string; label: string; displayOrder: number }>;
}

interface DealProperty {
  name: string;
  label: string;
}

interface HandoffPermissions {
  canManageSettings: boolean;
  canCreateTicket: boolean;
}

type LoadState = "loading" | "ready" | "saving" | "error";

hubspot.extend<"settings">(() => <SettingsPage />);

function SettingsPage(): React.ReactElement {
  const context = useExtensionContext<"settings">();
  const portalId = context.portal.id;
  const [state, setState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<AppSettings>({
    enabled: true,
    requiredProperties: ["dealname", "amount", "closedate"],
    requireCompany: true,
    requireContact: true,
    ticketPipelineId: "",
    ticketStageId: "",
    ticketSubjectPrefix: "Customer handoff",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pipelines, setPipelines] = useState<TicketPipeline[]>([]);
  const [dealProperties, setDealProperties] = useState<DealProperty[]>([]);
  const [permissions, setPermissions] = useState<HandoffPermissions | null>(
    null,
  );

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    setSaved(false);
    try {
      const [nextSettings, nextPipelines, nextPermissions, nextProperties] =
        await Promise.all([
          request<AppSettings>(portalId),
          loadTicketPipelines(portalId),
          loadAuthorization(portalId),
          loadDealProperties(portalId),
        ]);
      setSettings(nextSettings);
      setPipelines(nextPipelines);
      setPermissions(nextPermissions);
      setDealProperties(nextProperties);
      setState("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setState("error");
    }
  }, [portalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    setState("saving");
    setError(null);
    setSaved(false);
    try {
      setSettings(
        await request<AppSettings>(portalId, {
          method: "PUT",
          body: settings,
        }),
      );
      setSaved(true);
      setState("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setState("error");
    }
  }

  return (
    <Flex direction="column" gap="medium">
      <Heading>{"HandoffReady settings"}</Heading>
      <Text>
        Choose the information sales must complete and where HandoffReady should
        create the service ticket. Settings are encrypted and isolated by
        portal.
      </Text>
      {state === "loading" ? (
        <LoadingSpinner label="Loading settings" />
      ) : (
        <Flex direction="column" gap="small">
          {error ? (
            <Alert title="Settings could not be saved" variant="danger">
              {error}
            </Alert>
          ) : null}
          {saved ? (
            <Alert title="Settings saved" variant="success">
              The encrypted portal configuration is up to date.
            </Alert>
          ) : null}
          {permissions && !permissions.canManageSettings ? (
            <Alert title="Handoff settings are read-only" variant="info">
              Ask the app operator to add your HubSpot user ID as a HandoffReady
              administrator for this portal.
            </Alert>
          ) : null}
          <Checkbox
            name="enabled"
            checked={settings.enabled}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            onChange={(enabled) => setSettings({ ...settings, enabled })}
          >
            Enable handoff ticket creation
          </Checkbox>
          <Checkbox
            name="requireCompany"
            checked={settings.requireCompany}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            onChange={(requireCompany) =>
              setSettings({ ...settings, requireCompany })
            }
          >
            Require an associated company
          </Checkbox>
          <Checkbox
            name="requireContact"
            checked={settings.requireContact}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            onChange={(requireContact) =>
              setSettings({ ...settings, requireContact })
            }
          >
            Require an associated contact
          </Checkbox>
          <MultiSelect
            name="requiredProperties"
            label="Required deal properties"
            description="Choose the deal fields sales must complete before service can receive the handoff."
            value={settings.requiredProperties}
            options={dealProperties.map((property) => ({
              label: property.label,
              value: property.name,
            }))}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            onChange={(value) =>
              setSettings({
                ...settings,
                requiredProperties: value.map(String),
              })
            }
          />
          <Select
            name="ticketPipelineId"
            label="Service ticket pipeline"
            value={settings.ticketPipelineId}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            options={pipelines.map((pipeline) => ({
              label: pipeline.label,
              value: pipeline.id,
            }))}
            onChange={(value) => {
              const ticketPipelineId = String(value);
              const pipeline = pipelines.find(
                (item) => item.id === ticketPipelineId,
              );
              setSettings({
                ...settings,
                ticketPipelineId,
                ticketStageId:
                  pipeline?.stages
                    .slice()
                    .sort(
                      (left, right) => left.displayOrder - right.displayOrder,
                    )[0]?.id ?? "",
              });
            }}
          />
          <Select
            name="ticketStageId"
            label="Initial ticket stage"
            value={settings.ticketStageId}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            options={(
              pipelines.find(
                (pipeline) => pipeline.id === settings.ticketPipelineId,
              )?.stages ?? []
            )
              .slice()
              .sort((left, right) => left.displayOrder - right.displayOrder)
              .map((stage) => ({ label: stage.label, value: stage.id }))}
            onChange={(value) =>
              setSettings({ ...settings, ticketStageId: String(value) })
            }
          />
          <Input
            name="ticketSubjectPrefix"
            label="Ticket subject prefix"
            value={settings.ticketSubjectPrefix}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            onInput={(value) =>
              setSettings({ ...settings, ticketSubjectPrefix: String(value) })
            }
          />
          <Button
            variant="primary"
            disabled={
              state === "saving" ||
              !permissions?.canManageSettings ||
              settings.ticketSubjectPrefix.trim().length === 0
            }
            onClick={() => void save()}
          >
            {state === "saving" ? "Saving..." : "Save settings"}
          </Button>
          {state === "error" ? (
            <Button onClick={() => void load()}>Try again</Button>
          ) : null}
        </Flex>
      )}
    </Flex>
  );
}

async function loadTicketPipelines(
  portalId: number,
): Promise<TicketPipeline[]> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/ticket-pipelines?portalId=${portalId}`,
  );
  const body = (await response.json()) as {
    results?: TicketPipeline[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body.results ?? [];
}

async function loadAuthorization(
  portalId: number,
): Promise<HandoffPermissions> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/authorization?portalId=${portalId}`,
  );
  const body = (await response.json()) as HandoffPermissions & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body;
}

async function loadDealProperties(portalId: number): Promise<DealProperty[]> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/deal-properties?portalId=${portalId}`,
  );
  const body = (await response.json()) as {
    results?: DealProperty[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body.results ?? [];
}

async function request<Value>(
  portalId: number,
  options?: { method: "PUT"; body: AppSettings },
): Promise<Value> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/settings?portalId=${portalId}`,
    options
      ? {
          method: options.method,
          body: { ...options.body },
        }
      : undefined,
  );
  const body = (await response.json()) as Value & { error?: string };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected error occurred.";
}
