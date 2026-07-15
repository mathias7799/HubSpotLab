import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  EmptyState,
  Flex,
  Heading,
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
  useExtensionContext,
} from "@hubspot/ui-extensions";
import {
  PageBreadcrumbs,
  PageLink,
  PageTitle,
} from "@hubspot/ui-extensions/pages";

import {
  loadCatalog,
  loadRules,
  provision,
  type CatalogPipeline,
  type PortalCatalog,
  type StorageStatus,
} from "./api.ts";
import type { ReadinessRule, RuleSubject } from "./model.ts";
import { describeSources, ruleKindLabel, summarizeRules } from "./overview.ts";

type LoadState = "loading" | "idle" | "error";

export function HomePage(): React.ReactElement {
  const context = useExtensionContext<"pages">();
  const portalId = context.portal.id;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(
    null,
  );
  const [catalog, setCatalog] = useState<PortalCatalog | null>(null);
  const [rules, setRules] = useState<ReadinessRule[]>([]);
  const [pipelineId, setPipelineId] = useState("");

  const refresh = useCallback(
    async (preferredPipeline?: string) => {
      setState("loading");
      setError(null);
      setStorageWarning(null);
      try {
        const [catalogResult, storageResult] = await Promise.allSettled([
          loadCatalog(portalId),
          provision(portalId),
        ]);
        if (catalogResult.status === "rejected") {
          throw catalogResult.reason;
        }
        const nextCatalog = catalogResult.value;
        const nextPipeline =
          preferredPipeline || nextCatalog.pipelines[0]?.id || "";
        setCatalog(nextCatalog);
        setPipelineId(nextPipeline);
        if (storageResult.status === "fulfilled") {
          setStorageReady(true);
          setStorageStatus(storageResult.value);
          setRules(nextPipeline ? await loadRules(portalId, nextPipeline) : []);
        } else {
          setStorageReady(false);
          setStorageStatus(null);
          setRules([]);
          setStorageWarning(messageFrom(storageResult.reason));
        }
        setState("idle");
      } catch (cause) {
        setState("error");
        setError(messageFrom(cause));
      }
    },
    [portalId],
  );

  useEffect(() => {
    // Initial synchronization with HubSpot portal metadata.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function changePipeline(
    next: string | number | boolean,
  ): Promise<void> {
    const id = String(next);
    setPipelineId(id);
    setError(null);
    if (!storageReady) {
      setRules([]);
      return;
    }
    setState("loading");
    try {
      setRules(await loadRules(portalId, id));
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(messageFrom(cause));
    }
  }

  const pipeline = catalog?.pipelines.find((item) => item.id === pipelineId);
  const enabledRules = useMemo(
    () => rules.filter((rule) => rule.enabled),
    [rules],
  );
  const summary = summarizeRules(enabledRules, pipeline);

  return (
    <Flex direction="column" gap="medium">
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>CloseReady</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Pipeline readiness overview</PageTitle>
      <Text>
        See which deal transitions are governed, where blockers apply, and which
        stages still need requirements.
      </Text>

      {error ? (
        <Alert title="CloseReady could not load the overview" variant="danger">
          {error}
        </Alert>
      ) : null}

      {storageWarning ? (
        <Alert title="Rule storage needs attention" variant="warning">
          CloseReady could not initialize its single custom object. Open rule
          settings and refresh the portal data to retry. If the warning
          continues, reinstall the app to grant its custom-object scopes.
        </Alert>
      ) : null}

      {storageStatus?.mode === "external" ? (
        <Alert title="Portable rule storage active" variant="info">
          This portal does not include HubSpot custom objects, so CloseReady is
          using its encrypted portable store. Rules and readiness checks work
          normally.
          {storageStatus.durable
            ? ""
            : " Local development data resets when the API restarts."}
        </Alert>
      ) : null}

      <Flex direction="row" gap="small" align="end" wrap="wrap">
        {catalog ? (
          <Select
            name="overviewPipeline"
            label="Pipeline"
            value={pipelineId}
            options={catalog.pipelines.map((item) => ({
              label: item.label,
              value: item.id,
            }))}
            onChange={(value) => void changePipeline(value)}
          />
        ) : null}
        <Button
          disabled={state === "loading"}
          onClick={() => void refresh(pipelineId)}
        >
          Refresh overview
        </Button>
        <PageLink to="/settings">Manage rule settings</PageLink>
      </Flex>

      {state === "loading" ? (
        <Flex direction="row" gap="small" align="center">
          <LoadingSpinner label="Loading CloseReady overview" />
          <Text>Loading pipeline coverage...</Text>
        </Flex>
      ) : null}

      {pipeline ? (
        <>
          <Table bordered density="compact">
            <TableHead>
              <TableRow>
                <TableHeader>Active requirements</TableHeader>
                <TableHeader>Blocking rules</TableHeader>
                <TableHeader>Warning rules</TableHeader>
                <TableHeader>Governed target stages</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>{summary.total}</TableCell>
                <TableCell>{summary.blockers}</TableCell>
                <TableCell>{summary.warnings}</TableCell>
                <TableCell>
                  {summary.coveredStages}/{pipeline.stages.length}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <StageCoverageTable pipeline={pipeline} rules={enabledRules} />

          {enabledRules.length ? (
            <RequirementMix rules={enabledRules} />
          ) : (
            <EmptyState
              title={
                storageReady
                  ? "No active requirements"
                  : "Coverage will appear after setup"
              }
              layout="vertical"
            >
              <Text>
                {storageReady
                  ? "Open settings to add the first governed deal transition."
                  : "You can review pipelines now and finish rule setup after storage is installed."}
              </Text>
              <PageLink to="/settings">Open rule settings</PageLink>
            </EmptyState>
          )}
        </>
      ) : state !== "loading" ? (
        <EmptyState title="No deal pipeline found" layout="vertical">
          <Text>
            Create a deal pipeline in HubSpot, then refresh this page.
          </Text>
        </EmptyState>
      ) : null}
    </Flex>
  );
}

function StageCoverageTable({
  pipeline,
  rules,
}: {
  pipeline: CatalogPipeline;
  rules: ReadinessRule[];
}): React.ReactElement {
  const stages = [...pipeline.stages].sort(
    (left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0),
  );
  return (
    <Flex direction="column" gap="small">
      <Heading>Target-stage coverage</Heading>
      <Text>
        Coverage shows enabled requirements evaluated when a deal enters each
        stage.
      </Text>
      <Table bordered density="compact">
        <TableHead>
          <TableRow>
            <TableHeader>Target stage</TableHeader>
            <TableHeader>Blockers</TableHeader>
            <TableHeader>Warnings</TableHeader>
            <TableHeader>Source stages</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {stages.map((stage) => {
            const stageRules = rules.filter(
              (rule) => rule.targetStageId === stage.id,
            );
            const sources = new Set(stageRules.map((rule) => rule.fromStageId));
            return (
              <TableRow key={stage.id}>
                <TableCell>{stage.label}</TableCell>
                <TableCell>
                  {
                    stageRules.filter((rule) => rule.severity === "blocker")
                      .length
                  }
                </TableCell>
                <TableCell>
                  {
                    stageRules.filter((rule) => rule.severity === "warning")
                      .length
                  }
                </TableCell>
                <TableCell>{describeSources(sources, pipeline)}</TableCell>
                <TableCell>
                  <StatusTag
                    variant={stageRules.length ? "default" : "warning"}
                  >
                    {stageRules.length ? "Governed" : "No rules"}
                  </StatusTag>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Flex>
  );
}

function RequirementMix({
  rules,
}: {
  rules: ReadinessRule[];
}): React.ReactElement {
  const kinds = new Map<RuleSubject["kind"], number>();
  for (const rule of rules) {
    kinds.set(rule.subject.kind, (kinds.get(rule.subject.kind) ?? 0) + 1);
  }
  const rows = [...kinds.entries()];
  return (
    <Flex direction="column" gap="small">
      <Heading>Requirement mix</Heading>
      <Table bordered density="compact">
        <TableHead>
          <TableRow>
            <TableHeader>Requirement type</TableHeader>
            <TableHeader>Active rules</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(([kind, count]) => (
            <TableRow key={kind}>
              <TableCell>{ruleKindLabel(kind)}</TableCell>
              <TableCell>{count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Flex>
  );
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected CloseReady error occurred.";
}
