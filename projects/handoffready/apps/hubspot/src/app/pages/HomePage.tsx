import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  Flex,
  Link,
  LoadingSpinner,
  Select,
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
import {
  handoffStatus,
  attentionSummary,
  missingCount,
  summarizeHandoffs,
  type HandoffOverviewItem,
} from "./overview.ts";

type LoadState = "loading" | "ready" | "error";

interface OverviewRoute {
  id: string;
  name: string;
  department: string;
  outputType: "ticket" | "task" | "project_tasks";
}

export function HomePage(): React.ReactElement {
  const context = useExtensionContext<"pages">();
  const portalId = context.portal.id;
  const [state, setState] = useState<LoadState>("loading");
  const [results, setResults] = useState<HandoffOverviewItem[]>([]);
  const [routes, setRoutes] = useState<OverviewRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (routeId = "") => {
      setState("loading");
      setError(null);
      try {
        const [settingsResponse, response] = await Promise.all([
          hubspot.fetch(`${API_ORIGIN}/api/settings?portalId=${portalId}`),
          hubspot.fetch(
            `${API_ORIGIN}/api/handoffs?portalId=${portalId}${routeId ? `&routeId=${encodeURIComponent(routeId)}` : ""}`,
          ),
        ]);
        const settingsBody = (await settingsResponse.json()) as {
          routes?: OverviewRoute[];
          error?: string;
        };
        const body = (await response.json()) as {
          results?: HandoffOverviewItem[];
          error?: string;
        };
        if (!settingsResponse.ok) {
          throw new Error(
            settingsBody.error ??
              `HandoffReady settings error ${settingsResponse.status}.`,
          );
        }
        if (!response.ok) {
          throw new Error(
            body.error ?? `HandoffReady API error ${response.status}.`,
          );
        }
        const nextRoutes = settingsBody.routes ?? [];
        setRoutes(nextRoutes);
        setSelectedRouteId(routeId || nextRoutes[0]?.id || "");
        setResults(body.results ?? []);
        setState("ready");
      } catch (cause) {
        setError(messageFrom(cause));
        setState("error");
      }
    },
    [portalId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeHandoffs(results), [results]);

  return (
    <Flex direction="column" gap="medium">
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>HandoffReady</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Handoff operations overview</PageTitle>
      <Text>
        Review readiness for every receiving department and resolve gaps before
        the handoff begins.
      </Text>

      {routes.length > 0 ? (
        <Select
          name="overviewRoute"
          label="Handoff route"
          description="Switch departments without leaving the overview."
          value={selectedRouteId}
          options={routes.map((route) => ({
            label: `${route.department}: ${route.name}`,
            value: route.id,
          }))}
          onChange={(value) => {
            const routeId = String(value);
            setSelectedRouteId(routeId);
            void load(routeId);
          }}
        />
      ) : null}

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
          <StatusTag variant="info">{summary.ready} ready to create</StatusTag>
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
              <TableHeader>Open requirements</TableHeader>
              <TableHeader>Handoff destination</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((item) => {
              const status = handoffStatus(item);
              return (
                <TableRow key={item.dealId}>
                  <TableCell>
                    <Link
                      href={`https://app.hubspot.com/contacts/${portalId}/record/0-3/${item.dealId}`}
                    >
                      {item.dealName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusTag variant={status.variant}>
                      {status.label}
                    </StatusTag>
                  </TableCell>
                  <TableCell>
                    <Text>{attentionSummary(item)}</Text>
                    <Text variant="microcopy">
                      {missingCount(item)} prerequisite
                      {missingCount(item) === 1 ? "" : "s"} missing
                    </Text>
                  </TableCell>
                  <TableCell>
                    {item.outputIds[0] ? (
                      <Link href={recordUrl(portalId, item)}>
                        Open{" "}
                        {item.outputType === "ticket"
                          ? "ticket"
                          : item.outputType === "task"
                            ? item.outputIds.length === 1
                              ? "task"
                              : `first of ${item.outputIds.length} tasks`
                            : "project"}
                      </Link>
                    ) : (
                      "Not created"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      <Button
        disabled={state === "loading"}
        onClick={() => void load(selectedRouteId)}
      >
        Refresh handoffs
      </Button>
    </Flex>
  );
}

function recordUrl(portalId: number, item: HandoffOverviewItem): string {
  const objectTypeId =
    item.outputType === "ticket"
      ? "0-5"
      : item.outputType === "task"
        ? "0-27"
        : "0-970";
  return `https://app.hubspot.com/contacts/${portalId}/record/${objectTypeId}/${item.outputIds[0]}`;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected error occurred.";
}
