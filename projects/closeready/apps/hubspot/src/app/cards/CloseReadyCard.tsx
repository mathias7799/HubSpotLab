import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListItem,
  Divider,
  EmptyState,
  Flex,
  Heading,
  LoadingSpinner,
  Select,
  Text,
  hubspot,
  useExtensionActions,
  useExtensionContext,
} from "@hubspot/ui-extensions";

import { CLOSEREADY_BACKEND_URL } from "./backend.ts";

interface CatalogStage {
  id: string;
  label: string;
  displayOrder?: number;
}

interface CatalogPipeline {
  id: string;
  label: string;
  stages: CatalogStage[];
}

interface PortalCatalog {
  pipelines: CatalogPipeline[];
}

interface DealContext {
  dealId: string;
  pipelineId: string;
  currentStageId: string;
}

interface ActorPermissions {
  canTransition: boolean;
}

interface RuleResult {
  passed: boolean;
  message: string;
  rule: { id: string; label: string; severity: "blocker" | "warning" };
}

interface ReadinessEvaluation {
  ready: boolean;
  score: number;
  blockers: RuleResult[];
  warnings: RuleResult[];
  results: RuleResult[];
}

hubspot.extend<"crm.record.sidebar">(() => <CloseReadyCard />);

function CloseReadyCard(): React.ReactElement {
  const context = useExtensionContext<"crm.record.sidebar">();
  const actions = useExtensionActions<"crm.record.sidebar">();
  const dealId = String(context.crm?.objectId ?? "");
  const portalId = context.portal.id;
  const [catalog, setCatalog] = useState<PortalCatalog | null>(null);
  const [deal, setDeal] = useState<DealContext | null>(null);
  const [targetStageId, setTargetStageId] = useState("");
  const [evaluation, setEvaluation] = useState<ReadinessEvaluation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState<
    "evaluate" | "transition" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState(false);
  const [canTransition, setCanTransition] = useState(false);

  async function loadContext(): Promise<void> {
    setLoading(true);
    setError(null);
    if (!dealId) {
      setError("CloseReady could not identify this deal.");
      setLoading(false);
      return;
    }
    try {
      const [nextCatalog, nextDeal, permissions] = await Promise.all([
        request<PortalCatalog>(`/api/catalog?portalId=${portalId}`),
        request<DealContext>(
          `/api/deals/${encodeURIComponent(dealId)}/context?portalId=${portalId}`,
        ),
        request<ActorPermissions>(`/api/authorization?portalId=${portalId}`),
      ]);
      setCatalog(nextCatalog);
      setDeal(nextDeal);
      setEvaluation(null);
      setLastChecked(false);
      setCanTransition(permissions.canTransition);
      const nextStages = orderedStages(
        nextCatalog.pipelines.find(
          (pipeline) => pipeline.id === nextDeal.pipelineId,
        ),
      );
      setTargetStageId(defaultTargetStage(nextStages, nextDeal.currentStageId));
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadContext();
  }, [dealId, portalId]);

  const pipeline = catalog?.pipelines.find(
    (item) => item.id === deal?.pipelineId,
  );
  const stages = useMemo(() => orderedStages(pipeline), [pipeline]);
  const currentStage = stages.find(
    (stage) => stage.id === deal?.currentStageId,
  );
  const targetStage = stages.find((stage) => stage.id === targetStageId);

  async function run(action: "evaluate" | "transition"): Promise<void> {
    if (!deal || !targetStageId) return;
    setWorkingAction(action);
    setError(null);
    try {
      const result = await request<ReadinessEvaluation>(
        `/api/deals/${encodeURIComponent(deal.dealId)}/${action}?portalId=${portalId}`,
        { method: "POST", body: { targetStageId } },
      );
      setEvaluation(result);
      setLastChecked(true);
      if (action === "transition" && result.ready) {
        const completedStageId = targetStageId;
        setDeal({ ...deal, currentStageId: completedStageId });
        setTargetStageId(defaultTargetStage(stages, completedStageId));
        setEvaluation(null);
        setLastChecked(false);
        actions.refreshObjectProperties();
        actions.addAlert({
          type: "success",
          title: "CloseReady",
          message: `Moved to ${targetStage?.label ?? "the selected stage"}.`,
        });
      }
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setWorkingAction(null);
    }
  }

  if (loading) {
    return (
      <Flex direction="column" gap="small" align="center">
        <LoadingSpinner label="Loading deal readiness" />
        <Text variant="microcopy">Loading pipeline and rule context...</Text>
      </Flex>
    );
  }

  if (error && (!pipeline || !deal)) {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="CloseReady could not load this deal" variant="danger">
          {error}
        </Alert>
        <Button onClick={() => void loadContext()}>Try again</Button>
      </Flex>
    );
  }

  if (!pipeline || !deal || stages.length === 0) {
    return (
      <EmptyState
        imageName="deals"
        layout="vertical"
        title="No stages available"
      >
        CloseReady could not find an active pipeline with stages for this deal.
      </EmptyState>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      {error ? (
        <Alert title="The readiness check failed" variant="danger">
          {error}
        </Alert>
      ) : null}

      <Flex direction="column" gap="small">
        <Heading>Plan the next stage</Heading>
        <DescriptionList direction="row">
          <DescriptionListItem label="Pipeline">
            {pipeline.label}
          </DescriptionListItem>
          <DescriptionListItem label="Current stage">
            {currentStage?.label ?? deal.currentStageId}
          </DescriptionListItem>
        </DescriptionList>
      </Flex>

      <Select
        name="targetStage"
        label="Target stage"
        value={targetStageId}
        options={stages
          .filter((stage) => stage.id !== deal.currentStageId)
          .map((stage) => ({ label: stage.label, value: stage.id }))}
        onChange={(value) => {
          setTargetStageId(String(value));
          setEvaluation(null);
          setLastChecked(false);
          setError(null);
        }}
      />

      {evaluation ? <EvaluationSummary evaluation={evaluation} /> : null}

      {evaluation && !evaluation.ready && evaluation.blockers.length ? (
        <Alert title="Complete the blockers on this deal" variant="warning">
          Update the missing deal or associated-record data, then check again.
        </Alert>
      ) : null}

      {evaluation?.ready && !canTransition ? (
        <Alert title="An authorized user must move this deal" variant="info">
          The requirements pass, but your HubSpot user is not configured for
          CloseReady stage transitions in this portal.
        </Alert>
      ) : null}

      <PrimaryAction
        evaluation={evaluation}
        targetStageLabel={targetStage?.label ?? "selected stage"}
        workingAction={workingAction}
        disabled={!targetStageId}
        canTransition={canTransition}
        onEvaluate={() => void run("evaluate")}
        onTransition={() => void run("transition")}
      />

      <Divider size="extra-small" />
      {lastChecked ? (
        <Text variant="microcopy">
          Checked against live HubSpot data just now.
        </Text>
      ) : null}
      <Text variant="microcopy">
        Native HubSpot stage changes bypass app rules. Use this card for a
        governed move.
      </Text>
    </Flex>
  );
}

function PrimaryAction({
  evaluation,
  targetStageLabel,
  workingAction,
  disabled,
  canTransition,
  onEvaluate,
  onTransition,
}: {
  evaluation: ReadinessEvaluation | null;
  targetStageLabel: string;
  workingAction: "evaluate" | "transition" | null;
  disabled: boolean;
  canTransition: boolean;
  onEvaluate: () => void;
  onTransition: () => void;
}): React.ReactElement {
  if (evaluation && evaluation.results.length === 0) {
    return <Button disabled>Configure rules before moving</Button>;
  }
  if (evaluation?.ready) {
    if (!canTransition) {
      return (
        <Button disabled>Ready, but transition permission is required</Button>
      );
    }
    return (
      <Button
        variant="primary"
        disabled={disabled || workingAction !== null}
        onClick={onTransition}
      >
        {workingAction === "transition"
          ? "Moving..."
          : `Move to ${targetStageLabel}`}
      </Button>
    );
  }

  return (
    <Button
      variant={evaluation ? "secondary" : "primary"}
      disabled={disabled || workingAction !== null}
      onClick={onEvaluate}
    >
      {workingAction === "evaluate"
        ? "Checking..."
        : evaluation
          ? "Check again"
          : "Check readiness"}
    </Button>
  );
}

function EvaluationSummary({
  evaluation,
}: {
  evaluation: ReadinessEvaluation;
}): React.ReactElement {
  const passedCount = evaluation.results.filter(
    (result) => result.passed,
  ).length;
  const orderedResults = [...evaluation.results].sort(
    (left, right) => Number(left.passed) - Number(right.passed),
  );

  return (
    <Flex direction="column" gap="small">
      <Heading>{evaluationTitle(evaluation)}</Heading>
      <Text>
        {passedCount} of {evaluation.results.length} requirements passed
      </Text>
      {evaluation.results.length === 0 ? (
        <Alert title="No rules for this transition" variant="warning">
          The selected source and target stages have no enabled CloseReady
          requirements.
        </Alert>
      ) : (
        <Flex direction="column" gap="small">
          <Heading>
            {evaluation.ready ? "Requirements" : "Readiness details"}
          </Heading>
          {orderedResults.map((result) => (
            <Flex key={result.rule.id} direction="column" gap="extra-small">
              <Text>{result.rule.label}</Text>
              <Text variant="microcopy">
                {result.passed
                  ? "Complete"
                  : result.rule.severity === "warning"
                    ? `Warning: ${result.message}`
                    : result.message}
              </Text>
            </Flex>
          ))}
        </Flex>
      )}
    </Flex>
  );
}

function evaluationTitle(evaluation: ReadinessEvaluation): string {
  if (evaluation.blockers.length) {
    return `${evaluation.blockers.length} ${evaluation.blockers.length === 1 ? "blocker" : "blockers"} to resolve`;
  }
  if (evaluation.warnings.length) {
    return `Ready with ${evaluation.warnings.length} ${evaluation.warnings.length === 1 ? "warning" : "warnings"}`;
  }
  return "Ready to move";
}

function defaultTargetStage(
  stages: CatalogStage[],
  currentStageId: string,
): string {
  const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);
  return (
    stages[currentIndex + 1]?.id ??
    stages.find((stage) => stage.id !== currentStageId)?.id ??
    ""
  );
}

function orderedStages(pipeline: CatalogPipeline | undefined): CatalogStage[] {
  return [...(pipeline?.stages ?? [])].sort(
    (left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0),
  );
}

async function request<T>(
  path: string,
  options: Parameters<typeof hubspot.fetch>[1] = {},
): Promise<T> {
  const response = await hubspot.fetch(
    `${CLOSEREADY_BACKEND_URL}${path}`,
    options,
  );
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
