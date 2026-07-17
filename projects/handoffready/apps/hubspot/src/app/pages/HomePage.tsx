import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  Flex,
  Link,
  LoadingSpinner,
  StatusTag,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  hubspot,
  useExtensionContext,
} from "@hubspot/ui-extensions";
import { PageBreadcrumbs, PageTitle } from "@hubspot/ui-extensions/pages";

import { API_ORIGIN } from "./backend.ts";

interface HandoffReadiness {
  dealId: string;
  dealName: string;
  configurationReady: boolean;
  prerequisitesReady: boolean;
  complete: boolean;
  ticketId?: string;
  items: Array<{ key: string; passed: boolean }>;
}

type LoadState = "loading" | "ready" | "error";

export function HomePage(): React.ReactElement {
  const context = useExtensionContext<"pages">();
  const portalId = context.portal.id;
  const [state, setState] = useState<LoadState>("loading");
  const [results, setResults] = useState<HandoffReadiness[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await hubspot.fetch(
        `${API_ORIGIN}/api/handoffs?portalId=${portalId}`,
      );
      const body = (await response.json()) as {
        results?: HandoffReadiness[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error ?? `HandoffReady API error ${response.status}.`,
        );
      }
      setResults(body.results ?? []);
      setState("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setState("error");
    }
  }, [portalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => ({
      complete: results.filter((item) => item.complete).length,
      ready: results.filter((item) => !item.complete && item.prerequisitesReady)
        .length,
      blocked: results.filter((item) => !item.prerequisitesReady).length,
    }),
    [results],
  );

  return (
    <Flex direction="column" gap="medium">
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>HandoffReady</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Customer handoff overview</PageTitle>
      <Text>
        Review the ten most recently updated closed-won deals and resolve sales
        to service handoff gaps before work begins.
      </Text>

      {state === "loading" ? (
        <Flex direction="row" gap="small" align="center">
          <LoadingSpinner label="Loading customer handoffs" />
          <Text>Checking live deal fields, associations, and tickets...</Text>
        </Flex>
      ) : null}

      {state === "error" ? (
        <Alert title="Handoff overview could not be loaded" variant="danger">
          {error}
        </Alert>
      ) : null}

      {state === "ready" ? (
        <Flex direction="row" gap="small" wrap="wrap">
          <StatusTag variant="success">{summary.complete} complete</StatusTag>
          <StatusTag variant="info">{summary.ready} ready for ticket</StatusTag>
          <StatusTag variant="warning">
            {summary.blocked} need attention
          </StatusTag>
        </Flex>
      ) : null}

      {state === "ready" && results.length === 0 ? (
        <EmptyState
          imageName="deals"
          layout="vertical"
          title="No closed-won deals found"
        >
          HandoffReady will list recently updated closed-won deals here.
        </EmptyState>
      ) : null}

      {results.length > 0 ? (
        <Table bordered density="compact">
          <TableHead>
            <TableRow>
              <TableHeader>Deal</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Missing</TableHeader>
              <TableHeader>Service ticket</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((item) => {
              const missing = item.items.filter(
                (check) => !check.passed,
              ).length;
              return (
                <TableRow key={item.dealId}>
                  <TableCell>
                    <Link
                      href={`https://app.hubspot.com/contacts/${portalId}/deal/${item.dealId}`}
                    >
                      {item.dealName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusTag
                      variant={
                        item.complete
                          ? "success"
                          : item.prerequisitesReady
                            ? "info"
                            : "warning"
                      }
                    >
                      {item.complete
                        ? "Complete"
                        : item.prerequisitesReady
                          ? "Ready for ticket"
                          : "Needs attention"}
                    </StatusTag>
                  </TableCell>
                  <TableCell>{missing}</TableCell>
                  <TableCell>{item.ticketId ?? "Not created"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      <Button disabled={state === "loading"} onClick={() => void load()}>
        Refresh handoffs
      </Button>
    </Flex>
  );
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected error occurred.";
}
