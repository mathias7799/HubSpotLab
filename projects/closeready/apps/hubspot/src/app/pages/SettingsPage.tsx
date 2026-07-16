import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  ButtonRow,
  EmptyState,
  Flex,
  Heading,
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
  updateRule,
  type CatalogPipeline,
  type PortalCatalog,
  type StorageStatus,
} from "./api.ts";
import type {
  AssociatedObjectType,
  ReadinessRule,
  RuleOperator,
  RuleSubject,
} from "./model.ts";
import { findDuplicateRule } from "./rules.ts";

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
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(
    null,
  );
  const [catalog, setCatalog] = useState<PortalCatalog | null>(null);
  const [rules, setRules] = useState<ReadinessRule[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [editingRule, setEditingRule] = useState<ReadinessRule | null>(null);

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

  async function addRule(rule: ReadinessRule): Promise<void> {
    const duplicate = findDuplicateRule(rule, rules);
    if (duplicate) {
      setError(
        `This transition already requires ${duplicate.label}. Edit the existing requirement instead.`,
      );
      return;
    }
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

  async function saveRule(rule: ReadinessRule): Promise<void> {
    const duplicate = findDuplicateRule(rule, rules);
    if (duplicate) {
      setError(
        `This transition already requires ${duplicate.label}. Combine the settings with that requirement instead.`,
      );
      return;
    }
    setState("saving");
    setError(null);
    try {
      const saved = await updateRule(portalId, rule);
      setRules((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setEditingRule(null);
      setState("idle");
      actions.addAlert({
        type: "success",
        title: "CloseReady",
        message: "The transition requirement was updated.",
      });
    } catch (cause) {
      setState("error");
      setError(messageFrom(cause));
    }
  }

  async function toggleRule(rule: ReadinessRule): Promise<void> {
    await saveRule({ ...rule, enabled: !rule.enabled });
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
        <Alert title="Rule storage needs attention" variant="warning">
          CloseReady could not initialize its single custom object. Refresh the
          portal data to retry. If the warning continues, reinstall the app to
          grant its custom-object scopes.
        </Alert>
      ) : null}

      {storageStatus?.mode === "external" ? (
        <Alert title="Portable rule storage active" variant="info">
          HubSpot custom objects are not available in this portal. CloseReady
          automatically stores rules in its encrypted portable backend instead.
          {storageStatus.durable
            ? ""
            : " Local development data resets when the API restarts."}
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
              key={`${pipeline.id}-${editingRule?.id ?? "new"}`}
              pipeline={pipeline}
              catalog={catalog}
              busy={busy}
              canSave={storageReady}
              editingRule={editingRule}
              onCreate={addRule}
              onUpdate={saveRule}
              onCancel={() => setEditingRule(null)}
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
            onEdit={setEditingRule}
            onToggle={toggleRule}
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
  editingRule,
  onCreate,
  onUpdate,
  onCancel,
}: {
  pipeline: CatalogPipeline;
  catalog: PortalCatalog;
  busy: boolean;
  canSave: boolean;
  editingRule: ReadinessRule | null;
  onCreate: (rule: ReadinessRule) => Promise<void>;
  onUpdate: (rule: ReadinessRule) => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  const [fromStageId, setFromStageId] = useState(
    editingRule?.fromStageId ?? "*",
  );
  const [targetStageId, setTargetStageId] = useState(
    editingRule?.targetStageId ?? pipeline.stages.at(-1)?.id ?? "",
  );
  const [kind, setKind] = useState<RuleKind>(
    editingRule?.subject.kind ?? "deal_property",
  );
  const [objectType, setObjectType] = useState<AssociatedObjectType>(
    subjectObjectType(editingRule),
  );
  const [propertyName, setPropertyName] = useState(
    subjectPropertyName(editingRule),
  );
  const [associationLabel, setAssociationLabel] = useState(
    subjectAssociationLabel(editingRule),
  );
  const [quantifier, setQuantifier] = useState<"any" | "all">(
    editingRule?.subject.kind === "associated_record_property"
      ? editingRule.subject.quantifier
      : "any",
  );
  const [operator, setOperator] = useState<RuleOperator>(
    editingRule?.operator ?? "present",
  );
  const [expectedValue, setExpectedValue] = useState(
    typeof editingRule?.expectedValue === "number"
      ? editingRule.expectedValue
      : 1,
  );
  const [severity, setSeverity] = useState<"blocker" | "warning">(
    editingRule?.severity ?? "blocker",
  );
  const [nativeEnforcement, setNativeEnforcement] = useState(
    editingRule?.nativeEnforcement ?? false,
  );

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
    const rule: ReadinessRule = {
      id: editingRule?.id ?? `new-${Date.now()}`,
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
    };
    if (editingRule) await onUpdate(rule);
    else await onCreate(rule);
  }

  return (
    <Flex direction="column" gap="medium">
      <Heading>
        {editingRule
          ? "Edit transition requirement"
          : "Add a transition requirement"}
      </Heading>
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
          {editingRule ? "Save changes" : "Add requirement"}
        </Button>
        {editingRule ? (
          <Button disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </ButtonRow>
    </Flex>
  );
}

function RuleList({
  rules,
  pipeline,
  busy,
  canDelete,
  onEdit,
  onToggle,
  onDelete,
}: {
  rules: ReadinessRule[];
  pipeline?: CatalogPipeline;
  busy: boolean;
  canDelete: boolean;
  onEdit: (rule: ReadinessRule) => void;
  onToggle: (rule: ReadinessRule) => Promise<void>;
  onDelete: (rule: ReadinessRule) => Promise<void>;
}): React.ReactElement {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  if (!rules.length) {
    return (
      <EmptyState
        title={
          canDelete
            ? "No requirements in this pipeline"
            : "Rule storage needs setup"
        }
        layout="vertical"
      >
        <Text>
          {canDelete
            ? "Add the first transition requirement above."
            : "Requirements will appear here after the CloseReady custom object is initialized."}
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
                <Flex direction="row" gap="extra-small" wrap="wrap">
                  <Button
                    size="xs"
                    disabled={busy}
                    onClick={() => onEdit(rule)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    disabled={busy || !canDelete}
                    onClick={() => void onToggle(rule)}
                  >
                    {rule.enabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive"
                    disabled={busy || !canDelete}
                    onClick={() => {
                      if (confirmDeleteId === rule.id) {
                        setConfirmDeleteId(null);
                        void onDelete(rule);
                      } else {
                        setConfirmDeleteId(rule.id);
                      }
                    }}
                  >
                    {confirmDeleteId === rule.id ? "Confirm delete" : "Delete"}
                  </Button>
                </Flex>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Flex>
  );
}

function subjectObjectType(rule: ReadinessRule | null): AssociatedObjectType {
  return rule?.subject.kind === "associated_record_count" ||
    rule?.subject.kind === "associated_record_property"
    ? rule.subject.objectType
    : "contacts";
}

function subjectPropertyName(rule: ReadinessRule | null): string {
  if (
    rule?.subject.kind === "deal_property" ||
    rule?.subject.kind === "associated_record_property"
  ) {
    return rule.subject.propertyName;
  }
  if (rule?.subject.kind === "metric") return rule.subject.metric;
  return "amount";
}

function subjectAssociationLabel(rule: ReadinessRule | null): string {
  return rule?.subject.kind === "associated_record_count" ||
    rule?.subject.kind === "associated_record_property"
    ? (rule.subject.associationLabel ?? "*")
    : "*";
}

function buildSubject(input: {
  kind: RuleKind;
  objectType: AssociatedObjectType;
  propertyName: string;
  associationLabel: string;
  quantifier: "any" | "all";
}): RuleSubject {
  const label =
    input.associationLabel !== "*"
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
