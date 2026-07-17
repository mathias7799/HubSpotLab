import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Heading,
  LoadingSpinner,
  Text,
  hubspot,
  useExtensionContext,
} from "@hubspot/ui-extensions";
import { PageBreadcrumbs, PageTitle } from "@hubspot/ui-extensions/pages";

import { API_ORIGIN } from "./backend.ts";

type ConnectionState = "loading" | "connected" | "not-installed" | "error";

export function HomePage(): React.ReactElement {
  const context = useExtensionContext<"pages">();
  const portalId = context.portal.id;
  const [state, setState] = useState<ConnectionState>("loading");

  async function checkHealth(): Promise<void> {
    setState("loading");
    try {
      const response = await hubspot.fetch(
        `${API_ORIGIN}/api/installation?portalId=${portalId}`,
      );
      setState(
        response.ok
          ? "connected"
          : response.status === 401
            ? "not-installed"
            : "error",
      );
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void checkHealth();
  }, [portalId]);

  return (
    <Flex direction="column" gap="medium">
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>
          {"__SPOTKIT_DISPLAY_NAME_JSON__"}
        </PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>{"__SPOTKIT_DISPLAY_NAME_JSON__"}</PageTitle>
      <Text>{"__SPOTKIT_DESCRIPTION_JSON__"}</Text>
      <Heading>Connection</Heading>
      {state === "loading" ? (
        <LoadingSpinner label="Checking API health" />
      ) : state === "connected" ? (
        <Alert title="Connected to this HubSpot account" variant="success">
          OAuth is installed and the API can access portal {portalId}.
        </Alert>
      ) : state === "not-installed" ? (
        <Alert title="OAuth connection required" variant="warning">
          Install or reconnect the app through its OAuth installation URL, then
          check again.
        </Alert>
      ) : (
        <Alert title="API unavailable" variant="danger">
          The signed connection check failed. Verify the API origin, deployment,
          and OAuth configuration.
        </Alert>
      )}
      <Button disabled={state === "loading"} onClick={() => void checkHealth()}>
        Check again
      </Button>
    </Flex>
  );
}
