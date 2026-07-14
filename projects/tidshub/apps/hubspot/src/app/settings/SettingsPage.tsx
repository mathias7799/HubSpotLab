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
  useExtensionActions,
  useExtensionContext,
} from "@hubspot/ui-extensions";

import { createSchema, ensureSchema, type SchemaStatus } from "./schema.ts";

hubspot.extend<"settings">(() => <SettingsPage />);

function SettingsPage(): React.ReactElement {
  const context = useExtensionContext<"settings">();
  const actions = useExtensionActions<"settings">();
  const [status, setStatus] = useState<SchemaStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [objectType, setObjectType] = useState<string | null>(null);

  const check = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const schema = await ensureSchema(context.portal.id);
      setObjectType(schema.fullyQualifiedName);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Kunne ikke kontrollere TidsHub-objektet.",
      );
    }
  }, [context.portal.id]);

  useEffect(() => {
    // Installation health is checked when the settings extension mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
  }, [check]);

  async function initialize(): Promise<void> {
    setStatus("creating");
    setError(null);
    try {
      const schema = await createSchema(context.portal.id);
      setObjectType(schema.fullyQualifiedName);
      setStatus("ready");
      actions.addAlert({
        type: "success",
        title: "TidsHub",
        message: "TidsHub-objektet er oprettet.",
      });
    } catch (cause) {
      setStatus("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "TidsHub-objektet kunne ikke oprettes.",
      );
    }
  }

  const busy = status === "checking" || status === "creating";

  return (
    <Flex direction="column" gap="medium">
      <Heading>TidsHub-indstillinger</Heading>

      {error ? (
        <Alert title="TidsHub" variant="danger">
          {error}
        </Alert>
      ) : null}

      <DescriptionList direction="row">
        <DescriptionListItem label="HubSpot-portal">
          {context.portal.id}
        </DescriptionListItem>
        <DescriptionListItem label="Bruger">
          {context.user.email}
        </DescriptionListItem>
        <DescriptionListItem label="Datamodel">
          Ét brugerdefineret objekt
        </DescriptionListItem>
        {objectType ? (
          <DescriptionListItem label="HubSpot-objektnavn">
            {objectType}
          </DescriptionListItem>
        ) : null}
      </DescriptionList>

      {busy ? (
        <Flex direction="row" gap="small" align="center">
          <LoadingSpinner label="Kontrollerer TidsHub" />
          <Text>
            {status === "creating"
              ? "Opretter TidsHub-objekt..."
              : "Kontrollerer opsætningen..."}
          </Text>
        </Flex>
      ) : (
        <StatusTag variant={status === "ready" ? "success" : "warning"}>
          {status === "ready"
            ? "TidsHub er klar"
            : "TidsHub skal initialiseres"}
        </StatusTag>
      )}

      <Text>
        Initialiseringen opretter præcis ét HubSpot-objekt: TidsHub-post.
        Objektet opbevarer tidsregistreringer, uger og normer via egenskaben
        Posttype.
      </Text>

      <ButtonRow>
        {status !== "ready" ? (
          <Button variant="primary" onClick={initialize} disabled={busy}>
            Initialiser TidsHub
          </Button>
        ) : null}
        <Button onClick={check} disabled={busy}>
          Kontrollér igen
        </Button>
      </ButtonRow>
    </Flex>
  );
}
