import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  ButtonRow,
  EmptyState,
  Flex,
  Heading,
  Link,
  LoadingSpinner,
  Select,
  StatusTag,
  StepperInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  useExtensionActions,
  useExtensionContext,
} from "@hubspot/ui-extensions";
import { PageBreadcrumbs, PageTitle } from "@hubspot/ui-extensions/pages";
import {
  createRule,
  deleteRule,
  loadCatalog,
  loadRules,
  provision,
  type CatalogPipeline,
  type PortalCatalog,
} from "./api.ts";
import type {
  AssociatedObjectType,
  ReadinessRule,
  RuleOperator,
  RuleSubject,
} from "./model.ts";

type RuleKind = RuleSubject["kind"];
type LoadState = "loading" | "idle" | "saving" | "error";

export function SettingsPage(): React.ReactElement {
  const context = useExtensionContext<"pages">();
  const actions = useExtensionActions<"pages">();
  const portalId = context.portal.id;
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
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
          setRules(nextPipeline ? await loadRules(portalId, nextPipeline) : []);
        } else {
          setStorageReady(false);
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

  async function addRule(rule: ReadinessRule): Promise<void> {
    setState("saving");
    setError(null);
    try {
      const saved = await createRule(portalId, rule);
      setRules((current) => [...current, saved]);
      setState("idle");
      actions.addAlert({
        type: "success",
        title: "CloseReady",
        message: "The transition requirement was added.",
      });
    } catch (cause) {
      setState("error");
      setError(messageFrom(cause));
    }
  }

  async function removeRule(rule: ReadinessRule): Promise<void> {
    setState("saving");
    setError(null);
    try {
      await deleteRule(portalId, rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setState("idle");
    } catch (cause) {
      setState("error");
      setError(messageFrom(cause));
    }
  }

  const pipeline = catalog?.pipelines.find((item) => item.id === pipelineId);
  const busy = state === "loading" || state === "saving";

  return (
    <Flex direction="column" gap="medium">
      <PageBreadcrumbs>
        <PageBreadcrumbs.PageLink to="/">CloseReady</PageBreadcrumbs.PageLink>
        <PageBreadcrumbs.Current>Settings</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Rule settings</PageTitle>
      <Text>
        Define exactly what must be complete when a deal moves between two
        stages. Requirements are evaluated against live HubSpot data.
      </Text>

      {error ? (
        <Alert
          title="CloseReady could not complete the request"
          variant="danger"
        >
          {error}
        </Alert>
      ) : null}

      {storageWarning ? (
        <Alert title="Rule storage is not installed yet" variant="warning">
          Pipeline metadata is available, but CloseReady cannot save rules in
          this portal until its single app object is approved and installed.
          You can review the complete configuration below in read-only mode.
          Request approval for the CloseReady prefix and CLOSEREADY_RULE name
          through the{" "}
          <Link
            href={{
              url: "https://app.hubspot.com/l/developer-overview/appObjectsEventsRequest",
              external: true,
            }}
          >
            HubSpot app-object form
          </Link>
          .
        </Alert>
      ) : null}

      {state === "loading" ? (
        <Flex direction="row" gap="small" align="center">
          <LoadingSpinner label="Loading CloseReady" />
          <Text>Loading pipelines and requirements...</Text>
        </Flex>
      ) : null}

      {catalog ? (
        <>
          <Flex direction="row" gap="small" align="end">
            <Select
              name="pipeline"
              label="Pipeline"
              value={pipelineId}
              options={catalog.pipelines.map((item) => ({
                label: item.label,
                value: item.id,
              }))}
              onChange={(value) => void changePipeline(value)}
            />
            <Button disabled={busy} onClick={() => void refresh(pipelineId)}>
              Refresh portal data
            </Button>
          </Flex>

          {pipeline ? (
            <RuleBuilder
              key={pipeline.id}
              pipeline={pipeline}
              catalog={catalog}
              busy={busy}
              canSave={storageReady}
              onCreate={addRule}
            />
          ) : (
            <EmptyState title="No deal pipeline found" layout="vertical">
              <Text>
                Create a deal pipeline in HubSpot, then refresh this page.
              </Text>
            </EmptyState>
          )}

          <RuleList
            rules={rules}
            pipeline={pipeline}
            busy={busy}
            canDelete={storageReady}
            onDelete={removeRule}
          />
        </>
      ) : null}
    </Flex>
  );
}

function RuleBuilder({
  pipeline,
  catalog,
  busy,
  canSave,
  onCreate,
}: {
  pipeline: CatalogPipeline;
  catalog: PortalCatalog;
  busy: boolean;
  canSave: boolean;
  onCreate: (rule: ReadinessRule) => Promise<void>;
}): React.ReactElement {
  const [fromStageId, setFromStageId] = useState("*");
  const [targetStageId, setTargetStageId] = useState(
    pipeline.stages.at(-1)?.id ?? "",
  );
  const [kind, setKind] = useState<RuleKind>("deal_property");
  const [objectType, setObjectType] =
    useState<AssociatedObjectType>("contacts");
  const [propertyName, setPropertyName] = useState("amount");
  const [associationLabel, setAssociationLabel] = useState("*");
  const [quantifier, setQuantifier] = useState<"any" | "all">("any");
  const [operator, setOperator] = useState<RuleOperator>("present");
  const [expectedValue, setExpectedValue] = useState(1);
  const [severity, setSeverity] = useState<"blocker" | "warning">("blocker");
  const [nativeEnforcement, setNativeEnforcement] = useState(false);

  const propertyOptions = useMemo(() => {
    const properties =
      kind === "deal_property"
        ? catalog.dealProperties
        : objectType === "contacts"
          ? catalog.contactProperties
          : catalog.companyProperties;
    return properties.map((property) => ({
      label: property.label || property.name,
      value: property.name,
    }));
  }, [catalog, kind, objectType]);
  const labelOptions = [
    { label: "Any association label", value: "*" },
    ...catalog.associationLabels[objectType]
      .filter((item) => item.label)
      .map((item) => ({
        label: String(item.label),
        value: String(item.label),
      })),
  ];
  const isAssociation = kind.startsWith("associated_record");
  const needsCount = kind === "associated_record_count" || kind === "metric";

  function changeKind(value: string | number | boolean): void {
    const next = String(value) as RuleKind;
    setKind(next);
    setNativeEnforcement(false);
    if (next === "associated_record_count" || next === "metric") {
      setOperator("count_at_least");
    } else {
      setOperator("present");
    }
    if (next === "metric") setPropertyName("line_item_count");
    if (next === "deal_property") {
      setPropertyName(catalog.dealProperties[0]?.name ?? "");
    }
    if (next === "associated_record_property") {
      setPropertyName(
        (objectType === "contacts"
          ? catalog.contactProperties
          : catalog.companyProperties)[0]?.name ?? "",
      );
    }
  }

  async function submit(): Promise<void> {
    const subject = buildSubject({
      kind,
      objectType,
      propertyName,
      associationLabel,
      quantifier,
    });
    const label = describeSubject(subject, propertyOptions);
    await onCreate({
      id: `new:${Date.now()}`,
      pipelineId: pipeline.id,
      fromStageId,
      targetStageId,
      label,
      subject,
      operator,
      ...(needsCount ? { expectedValue } : {}),
      severity,
      enabled: true,
      nativeEnforcement: kind === "deal_property" && nativeEnforcement,
    });
  }

  return (
    <Flex direction="column" gap="medium">
      <Heading>Add a transition requirement</Heading>
      <Text>
        When a deal moves from one stage to another, require the selected CRM
        data before allowing the guarded transition.
      </Text>
      <Flex direction="row" gap="small" wrap="wrap">
        <Select
          name="fromStage"
          label="From stage"
          value={fromStageId}
          options={[
            { label: "Any stage", value: "*" },
            ...stageOptions(pipeline),
          ]}
          onChange={(value) => {
            const next = String(value);
            setFromStageId(next);
            if (next !== "*") setNativeEnforcement(false);
          }}
        />
        <Select
          name="targetStage"
          label="To stage"
          value={targetStageId}
          options={stageOptions(pipeline)}
          onChange={(value) => setTargetStageId(String(value))}
        />
        <Select
          name="requirementType"
          label="Require"
          value={kind}
          options={[
            { label: "Deal property", value: "deal_property" },
            {
              label: "Associated contact or company",
              value: "associated_record_count",
            },
            {
              label: "Property on an associated record",
              value: "associated_record_property",
            },
            {
              label: "Line items, approved quotes, or open tasks",
              value: "metric",
            },
          ]}
          onChange={changeKind}
        />
      </Flex>

      {isAssociation ? (
        <Flex direction="row" gap="small" wrap="wrap">
          <Select
            name="objectType"
            label="Associated record type"
            value={objectType}
            options={[
              { label: "Contact", value: "contacts" },
              { label: "Company", value: "companies" },
            ]}
            onChange={(value) => {
              const next = String(value) as AssociatedObjectType;
              setObjectType(next);
              if (kind === "associated_record_property") {
                setPropertyName(
                  (next === "contacts"
                    ? catalog.contactProperties
                    : catalog.companyProperties)[0]?.name ?? "",
                );
              }
              setAssociationLabel("*");
            }}
          />
          <Select
            name="associationLabel"
            label="Required association label"
            description="Choose a HubSpot association label such as Decision maker."
            value={associationLabel}
            options={labelOptions}
            onChange={(value) => setAssociationLabel(String(value))}
          />
        </Flex>
      ) : null}

      {kind === "deal_property" || kind === "associated_record_property" ? (
        <Flex direction="row" gap="small" wrap="wrap">
          <Select
            name="property"
            label={
              kind === "deal_property" ? "Deal property" : "Required property"
            }
            value={propertyName}
            options={propertyOptions}
            onChange={(value) => setPropertyName(String(value))}
          />
          {kind === "associated_record_property" ? (
            <Select
              name="quantifier"
              label="Which matching records?"
              value={quantifier}
              options={[
                { label: "At least one", value: "any" },
                { label: "Every matching record", value: "all" },
              ]}
              onChange={(value) =>
                setQuantifier(String(value) as "any" | "all")
              }
            />
          ) : null}
        </Flex>
      ) : null}

      {kind === "metric" ? (
        <Select
          name="metric"
          label="Metric"
          value={propertyName}
          options={[
            { label: "Line item count", value: "line_item_count" },
            { label: "Approved quote count", value: "approved_quote_count" },
            { label: "Open task count", value: "open_task_count" },
          ]}
          onChange={(value) => setPropertyName(String(value))}
        />
      ) : null}

      {needsCount ? (
        <Flex direction="row" gap="small" wrap="wrap">
          <Select
            name="operator"
            label="Comparison"
            value={operator}
            options={[
              { label: "At least", value: "count_at_least" },
              { label: "Exactly", value: "equals" },
            ]}
            onChange={(value) => setOperator(String(value) as RuleOperator)}
          />
          <StepperInput
            name="expectedValue"
            label="Count"
            min={0}
            stepSize={1}
            value={expectedValue}
            onChange={(value) => setExpectedValue(Number(value))}
          />
        </Flex>
      ) : null}

      <Flex direction="row" gap="small" wrap="wrap">
        <Select
          name="severity"
          label="Result"
          value={severity}
          options={[
            { label: "Block transition", value: "blocker" },
            { label: "Show warning", value: "warning" },
          ]}
          onChange={(value) =>
            setSeverity(String(value) as "blocker" | "warning")
          }
        />
        {kind === "deal_property" && fromStageId === "*" ? (
          <Select
            name="nativeEnforcement"
            label="Native HubSpot setup status"
            description="Mark this only after you manually add the same property to HubSpot's stage rules."
            value={nativeEnforcement ? "true" : "false"}
            options={[
              { label: "CloseReady only", value: "false" },
              { label: "Marked as configured natively", value: "true" },
            ]}
            onChange={(value) => setNativeEnforcement(String(value) === "true")}
          />
        ) : null}
      </Flex>

      <Alert title="Enforcement" variant="info">
        CloseReady never changes HubSpot pipeline governance through private
        APIs. Configure native deal-property requirements in HubSpot, then mark
        them here. Association labels and contact/company fields use
        CloseReady's guarded move.
      </Alert>
      <ButtonRow>
        <Button
          variant="primary"
          disabled={busy || !canSave || !targetStageId || !propertyName}
          onClick={() => void submit()}
        >
          Add requirement
        </Button>
      </ButtonRow>
    </Flex>
  );
}

function RuleList({
  rules,
  pipeline,
  busy,
  canDelete,
  onDelete,
}: {
  rules: ReadinessRule[];
  pipeline?: CatalogPipeline;
  busy: boolean;
  canDelete: boolean;
  onDelete: (rule: ReadinessRule) => Promise<void>;
}): React.ReactElement {
  if (!rules.length) {
    return (
      <EmptyState
        title={
          canDelete
            ? "No requirements in this pipeline"
            : "Rule storage is pending approval"
        }
        layout="vertical"
      >
        <Text>
          {canDelete
            ? "Add the first transition requirement above."
            : "Requirements will appear here after the CloseReady app object is installed."}
        </Text>
      </EmptyState>
    );
  }
  return (
    <Flex direction="column" gap="small">
      <Heading>Configured requirements</Heading>
      <Table bordered density="compact">
        <TableHead>
          <TableRow>
            <TableHeader>Transition</TableHeader>
            <TableHeader>Requirement</TableHeader>
            <TableHeader>Enforcement</TableHeader>
            <TableHeader>Action</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                {stageLabel(pipeline, rule.fromStageId)} to{" "}
                {stageLabel(pipeline, rule.targetStageId)}
              </TableCell>
              <TableCell>{rule.label}</TableCell>
              <TableCell>
                <StatusTag
                  variant={rule.severity === "blocker" ? "warning" : "default"}
                >
                  {rule.nativeEnforcement
                    ? "Native setup marked"
                    : rule.severity === "blocker"
                      ? "CloseReady blocker"
                      : "Warning"}
                </StatusTag>
              </TableCell>
              <TableCell>
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy || !canDelete}
                  onClick={() => void onDelete(rule)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Flex>
  );
}

function buildSubject(input: {
  kind: RuleKind;
  objectType: AssociatedObjectType;
  propertyName: string;
  associationLabel: string;
  quantifier: "any" | "all";
}): RuleSubject {
  const label = input.associationLabel !== "*"
    ? { associationLabel: input.associationLabel }
    : {};
  switch (input.kind) {
    case "deal_property":
      return { kind: "deal_property", propertyName: input.propertyName };
    case "associated_record_count":
      return {
        kind: "associated_record_count",
        objectType: input.objectType,
        ...label,
      };
    case "associated_record_property":
      return {
        kind: "associated_record_property",
        objectType: input.objectType,
        propertyName: input.propertyName,
        quantifier: input.quantifier,
        ...label,
      };
    case "metric":
      return {
        kind: "metric",
        metric: input.propertyName as Extract<
          RuleSubject,
          { kind: "metric" }
        >["metric"],
      };
  }
}

function describeSubject(
  subject: RuleSubject,
  propertyOptions: Array<{ label: string; value: string }>,
): string {
  if (subject.kind === "deal_property") {
    return propertyLabel(subject.propertyName, propertyOptions);
  }
  if (subject.kind === "metric") {
    return subject.metric.replaceAll("_", " ");
  }
  const record = subject.objectType === "contacts" ? "contact" : "company";
  const tagged = subject.associationLabel
    ? `${subject.associationLabel} ${record}`
    : `Associated ${record}`;
  return subject.kind === "associated_record_count"
    ? tagged
    : `${tagged}: ${propertyLabel(subject.propertyName, propertyOptions)}`;
}

function propertyLabel(
  propertyName: string,
  options: Array<{ label: string; value: string }>,
): string {
  return (
    options.find((option) => option.value === propertyName)?.label ??
    propertyName
  );
}

function stageOptions(pipeline: CatalogPipeline) {
  return [...pipeline.stages]
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0))
    .map((stage) => ({ label: stage.label, value: stage.id }));
}

function stageLabel(
  pipeline: CatalogPipeline | undefined,
  stageId: string,
): string {
  if (stageId === "*") return "Any stage";
  return (
    pipeline?.stages.find((stage) => stage.id === stageId)?.label ?? stageId
  );
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected CloseReady error occurred.";
}
