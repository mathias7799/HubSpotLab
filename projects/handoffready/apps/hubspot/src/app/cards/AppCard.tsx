import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Heading,
  LoadingSpinner,
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextReadiness, permissions] = await Promise.all([
        request<HandoffReadiness>(portalId, dealId, "GET"),
        authorization(portalId),
      ]);
      setReadiness(nextReadiness);
      setCanCreateTicket(permissions.canCreateTicket);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }, [dealId, portalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTicket(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      const result = await request<HandoffReadiness>(portalId, dealId, "POST");
      setReadiness(result);
      actions.refreshObjectProperties();
      actions.addAlert({
        type: "success",
        title: "HandoffReady",
        message: `Service ticket ${result.ticketId ?? "created"} is linked to this deal.`,
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
              : readiness.prerequisitesReady
                ? "info"
                : "warning"
          }
        >
          {readiness.complete
            ? "Complete"
            : readiness.prerequisitesReady
              ? "Ready for ticket"
              : "Needs attention"}
        </StatusTag>
      </Flex>

      {error ? (
        <Alert title="Handoff action failed" variant="danger">
          {error}
        </Alert>
      ) : null}

      {!readiness.configurationReady ? (
        <Alert title="Ticket destination is not configured" variant="warning">
          Open HandoffReady settings and choose the service ticket pipeline and
          initial stage.
        </Alert>
      ) : null}

      {!canCreateTicket ? (
        <Alert title="Ticket creation is read-only" variant="info">
          You can review handoff readiness, but your HubSpot user is not a
          configured HandoffReady ticket creator for this portal.
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
        <Alert title="Handoff ticket is linked" variant="success">
          Service ticket {readiness.ticketId} is associated with this deal.
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
          {creating ? "Creating ticket..." : "Create service handoff ticket"}
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
  method: "GET" | "POST",
): Promise<Value> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/deals/${encodeURIComponent(dealId)}/handoff?portalId=${portalId}`,
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

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected error occurred.";
}
