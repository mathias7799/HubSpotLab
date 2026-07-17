import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Flex,
  Heading,
  LoadingSpinner,
  Text,
  hubspot,
} from "@hubspot/ui-extensions";
import { PageBreadcrumbs, PageTitle } from "@hubspot/ui-extensions/pages";

import { API_ORIGIN } from "./backend.ts";

type HealthState = "loading" | "ready" | "error";

export function HomePage(): React.ReactElement {
  const [state, setState] = useState<HealthState>("loading");

  async function checkHealth(): Promise<void> {
    setState("loading");
    try {
      const response = await hubspot.fetch(`${API_ORIGIN}/health`);
      setState(response.ok ? "ready" : "error");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void checkHealth();
  }, []);

  return (
    <Flex direction="column" gap="medium">
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>
          {"__SPOTKIT_DISPLAY_NAME_JSON__"}
        </PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>{"__SPOTKIT_DISPLAY_NAME_JSON__"}</PageTitle>
      <Text>{"__SPOTKIT_DESCRIPTION_JSON__"}</Text>
      <Heading>API connection</Heading>
      {state === "loading" ? (
        <LoadingSpinner label="Checking API health" />
      ) : state === "ready" ? (
        <Alert title="API connected" variant="success">
          The portable API responded successfully.
        </Alert>
      ) : (
        <Alert title="API unavailable" variant="danger">
          Check the configured API origin and local server.
        </Alert>
      )}
      <Button disabled={state === "loading"} onClick={() => void checkHealth()}>
        Check again
      </Button>
    </Flex>
  );
}
