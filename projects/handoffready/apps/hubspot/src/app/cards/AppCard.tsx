import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Heading,
  Link,
  LoadingSpinner,
  Select,
  StatusTag,
  Text,
  hubspot,
  useExtensionActions,
  useExtensionContext,
} from "@hubspot/ui-extensions";

import { API_ORIGIN } from "./backend.ts";

interface HandoffReadiness {
  dealId: string;
  dealName: string;
  configurationReady: boolean;
  prerequisitesReady: boolean;
  complete: boolean;
  ticketId?: string;
  routeId: string;
  routeName: string;
  department: string;
  outputType: "ticket" | "task" | "project_tasks";
  outputIds: string[];
  items: Array<{
    key: string;
    label: string;
    passed: boolean;
    detail: string;
  }>;
}

interface HandoffPermissions {
  canCreateTicket: boolean;
}

interface HandoffRoute {
  id: string;
  name: string;
  department: string;
  outputType: "ticket" | "task" | "project_tasks";
}

hubspot.extend<"crm.record.sidebar">(() => <AppCard />);

function AppCard(): React.ReactElement {
  const context = useExtensionContext<"crm.record.sidebar">();
  const actions = useExtensionActions<"crm.record.sidebar">();
  const portalId = context.portal.id;
  const dealId = String(context.crm?.objectId ?? "");
  const [readiness, setReadiness] = useState<HandoffReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canCreateTicket, setCanCreateTicket] = useState(false);
  const [routes, setRoutes] = useState<HandoffRoute[]>([]);
  const [routeId, setRouteId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, permissions] = await Promise.all([
        loadSettings(portalId),
        authorization(portalId),
      ]);
      const nextRouteId = settings.routes.some((route) => route.id === routeId)
        ? routeId
        : (settings.routes[0]?.id ?? "");
      if (!nextRouteId)
        throw new Error("No handoff routes are configured for this portal.");
      const nextReadiness = await request<HandoffReadiness>(
        portalId,
        dealId,
        nextRouteId,
        "GET",
      );
      setRoutes(settings.routes);
      setRouteId(nextRouteId);
      setReadiness(nextReadiness);
      setCanCreateTicket(permissions.canCreateTicket);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }, [dealId, portalId, routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTicket(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      const result = await request<HandoffReadiness>(
        portalId,
        dealId,
        routeId,
        "POST",
      );
      setReadiness(result);
      actions.refreshObjectProperties();
      actions.addAlert({
        type: "success",
        title: "HandoffReady",
        message: `${result.routeName} created ${result.outputIds.length} linked HubSpot record${result.outputIds.length === 1 ? "" : "s"}.`,
      });
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <Flex direction="column" gap="small" align="center">
        <LoadingSpinner label="Checking handoff readiness" />
        <Text variant="microcopy">
          Checking live deal and association data...
        </Text>
      </Flex>
    );
  }

  if (!readiness) {
    return (
      <Flex direction="column" gap="small">
        <Alert title="Handoff readiness could not be loaded" variant="danger">
          {error ?? "The API returned no readiness result."}
        </Alert>
        <Button onClick={() => void load()}>Try again</Button>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      <Flex direction="row" gap="small" align="center">
        <Heading>Sales to service handoff</Heading>
        <StatusTag
          variant={
            readiness.complete
              ? "success"
              : readiness.configurationReady && readiness.prerequisitesReady
                ? "info"
                : "warning"
          }
        >
          {readiness.complete
            ? "Complete"
            : !readiness.configurationReady
              ? "Setup required"
              : readiness.prerequisitesReady
                ? "Ready to create"
                : "Needs attention"}
        </StatusTag>
      </Flex>

      {error ? (
        <Alert title="Handoff action failed" variant="danger">
          {error}
        </Alert>
      ) : null}

      <Select
        name="handoffRoute"
        label="Send handoff to"
        description="Each department can have different requirements and create a different HubSpot record."
        value={routeId}
        options={routes.map((route) => ({
          label: `${route.department} — ${route.name}`,
          value: route.id,
        }))}
        onChange={(value) => setRouteId(String(value))}
      />

      {!readiness.configurationReady ? (
        <Alert
          title={`${readiness.routeName} needs a destination`}
          variant="warning"
        >
          Ask a HubSpot Super Admin to open HandoffReady settings and choose the
          destination pipeline and initial stage for this route.
        </Alert>
      ) : null}

      {!canCreateTicket ? (
        <Alert title="Handoff creation is read-only" variant="info">
          You can review handoff readiness, but your HubSpot user is not a
          permitted HandoffReady creator for this portal.
        </Alert>
      ) : null}

      <Flex direction="column" gap="small">
        {readiness.items.map((item) => (
          <Flex key={item.key} direction="column" gap="extra-small">
            <Flex direction="row" gap="small" align="center">
              <StatusTag variant={item.passed ? "success" : "warning"}>
                {item.passed ? "Ready" : "Missing"}
              </StatusTag>
              <Text>{item.label}</Text>
            </Flex>
            <Text variant="microcopy">{item.detail}</Text>
          </Flex>
        ))}
      </Flex>

      {readiness.complete ? (
        <Alert title={`${readiness.routeName} is complete`} variant="success">
          {readiness.outputIds.map((id, index) => (
            <Link
              key={id}
              href={recordUrl(portalId, readiness.outputType, id, index)}
            >
              Open {outputRecordLabel(readiness.outputType, index)} {id}
            </Link>
          ))}
        </Alert>
      ) : (
        <Button
          variant="primary"
          disabled={
            creating ||
            !canCreateTicket ||
            !readiness.prerequisitesReady ||
            !readiness.configurationReady
          }
          onClick={() => void createTicket()}
        >
          {creating
            ? "Creating handoff..."
            : `Create ${outputLabel(readiness.outputType)}`}
        </Button>
      )}

      <Button disabled={loading || creating} onClick={() => void load()}>
        Refresh readiness
      </Button>
    </Flex>
  );
}

async function authorization(portalId: number): Promise<HandoffPermissions> {
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

async function request<Value>(
  portalId: number,
  dealId: string,
  routeId: string,
  method: "GET" | "POST",
): Promise<Value> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/deals/${encodeURIComponent(dealId)}/handoff?portalId=${portalId}&routeId=${encodeURIComponent(routeId)}`,
    method === "POST" ? { method } : undefined,
  );
  const body = (await response.json()) as Value & { error?: string };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body;
}

async function loadSettings(
  portalId: number,
): Promise<{ routes: HandoffRoute[] }> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/settings?portalId=${portalId}`,
  );
  const body = (await response.json()) as {
    routes?: HandoffRoute[];
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  return { routes: body.routes ?? [] };
}

function outputLabel(type: HandoffReadiness["outputType"]): string {
  return type === "ticket"
    ? "service ticket"
    : type === "task"
      ? "handoff tasks"
      : "project and task plan";
}

function outputRecordLabel(
  type: HandoffReadiness["outputType"],
  index: number,
): string {
  if (type === "project_tasks") return index === 0 ? "project" : "task";
  return type;
}

function recordUrl(
  portalId: number,
  type: HandoffReadiness["outputType"],
  id: string,
  index: number,
): string {
  const objectTypeId =
    type === "ticket" ? "0-5" : type === "task" || index > 0 ? "0-27" : "0-970";
  return `https://app.hubspot.com/contacts/${portalId}/record/${objectTypeId}/${id}`;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected error occurred.";
}
