import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  ButtonRow,
  DescriptionList,
  DescriptionListItem,
  Flex,
  Heading,
  LoadingSpinner,
  StatusTag,
  Text,
  hubspot,
  useExtensionContext,
} from "@hubspot/ui-extensions";

import { CLOSEREADY_BACKEND_URL } from "./backend.ts";

type SetupState = "checking" | "ready" | "pending" | "error";

interface PortalInventory {
  pipelines: unknown[];
  dealProperties: unknown[];
  contactProperties: unknown[];
  companyProperties: unknown[];
  associationLabels: {
    contacts: AssociationLabel[];
    companies: AssociationLabel[];
  };
}

interface AssociationLabel {
  label?: string | null;
}

hubspot.extend<"settings">(() => <SettingsPage />);

function SettingsPage(): React.ReactElement {
  const context = useExtensionContext<"settings">();
  const portalId = context.portal.id;
  const [state, setState] = useState<SetupState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [inventory, setInventory] = useState<PortalInventory | null>(null);

  const check = useCallback(async () => {
    setState("checking");
    setError(null);
    setStorageMessage(null);
    try {
      const [catalogResult, storageResult] = await Promise.allSettled([
        request<PortalInventory>(`/api/catalog?portalId=${portalId}`),
        request(`/api/provision?portalId=${portalId}`, { method: "POST" }),
      ]);
      if (catalogResult.status === "rejected") {
        throw catalogResult.reason;
      }
      setInventory(catalogResult.value);
      if (storageResult.status === "fulfilled") {
        setState("ready");
      } else {
        setStorageMessage(messageFrom(storageResult.reason));
        setState("pending");
      }
    } catch (cause) {
      setState("error");
      setError(messageFrom(cause));
    }
  }, [portalId]);

  useEffect(() => {
    // Installation health is checked when the settings extension mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
  }, [check]);

  const labels = inventory
    ? [
        ...inventory.associationLabels.contacts,
        ...inventory.associationLabels.companies,
      ].filter((item) => item.label).length
    : 0;

  return (
    <Flex direction="column" gap="medium">
      <Heading>CloseReady settings</Heading>
      <Text>
        Check installation health and confirm which HubSpot data CloseReady can
        use for transition rules.
      </Text>

      {error ? (
        <Alert title="CloseReady could not check this portal" variant="danger">
          {error}
        </Alert>
      ) : null}

      {state === "checking" ? (
        <Flex direction="row" gap="small" align="center">
          <LoadingSpinner label="Checking CloseReady setup" />
          <Text>Checking OAuth access, portal metadata, and rule storage...</Text>
        </Flex>
      ) : (
        <StatusTag variant={state === "ready" ? "success" : "warning"}>
          {state === "ready"
            ? "CloseReady is ready"
            : state === "pending"
              ? "Rule storage pending"
              : "Setup check failed"}
        </StatusTag>
      )}

      {storageMessage ? (
        <Alert title="App-object approval required" variant="warning">
          HubSpot portal metadata is connected, but rule storage is read-only
          until the CloseReady app object is approved and installed.
        </Alert>
      ) : null}

      <DescriptionList direction="row">
        <DescriptionListItem label="HubSpot portal">
          {portalId}
        </DescriptionListItem>
        <DescriptionListItem label="Signed-in user">
          {context.user.email}
        </DescriptionListItem>
        <DescriptionListItem label="Rule data model">
          One app object
        </DescriptionListItem>
        <DescriptionListItem label="Deal pipelines">
          {inventory?.pipelines.length ?? 0}
        </DescriptionListItem>
        <DescriptionListItem label="Deal properties">
          {inventory?.dealProperties.length ?? 0}
        </DescriptionListItem>
        <DescriptionListItem label="Contact properties">
          {inventory?.contactProperties.length ?? 0}
        </DescriptionListItem>
        <DescriptionListItem label="Company properties">
          {inventory?.companyProperties.length ?? 0}
        </DescriptionListItem>
        <DescriptionListItem label="Custom association labels">
          {labels}
        </DescriptionListItem>
      </DescriptionList>

      <Heading>Enforcement model</Heading>
      <Text>
        Native HubSpot stage rules enforce supported deal properties.
        CloseReady handles labeled associations, associated contact and company
        fields, and guarded transitions through its OAuth service.
      </Text>

      <ButtonRow>
        <Button onClick={() => void check()} disabled={state === "checking"}>
          Check setup again
        </Button>
      </ButtonRow>
    </Flex>
  );
}

async function request<T = unknown>(
  path: string,
  options: Parameters<typeof hubspot.fetch>[1] = {},
): Promise<T> {
  const response = await hubspot.fetch(`${CLOSEREADY_BACKEND_URL}${path}`, options);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `CloseReady API error ${response.status}`);
  }
  return body;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected CloseReady error occurred.";
}
