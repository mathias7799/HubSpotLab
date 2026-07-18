import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  Heading,
  Input,
  LoadingSpinner,
  MultiSelect,
  NumberInput,
  Select,
  Text,
  TextArea,
  hubspot,
  useExtensionContext,
} from "@hubspot/ui-extensions";

import { API_ORIGIN } from "./backend.ts";

interface AppSettings {
  enabled: boolean;
  requiredProperties: string[];
  requireCompany: boolean;
  requireContact: boolean;
  ticketPipelineId: string;
  ticketStageId: string;
  ticketSubjectPrefix: string;
  routes: HandoffRoute[];
}

type HandoffOutputType = "ticket" | "task" | "project_tasks";

interface HandoffRoute {
  id: string;
  name: string;
  department: string;
  outputType: HandoffOutputType;
  requiredProperties: string[];
  requireCompany: boolean;
  requireContact: boolean;
  pipelineId: string;
  stageId: string;
  subjectPrefix: string;
  taskTemplates: HandoffTaskTemplate[];
}

interface HandoffTaskTemplate {
  id: string;
  name: string;
  description: string;
  status: "NOT_STARTED" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueInDays: number;
}

interface TicketPipeline {
  id: string;
  label: string;
  stages: Array<{ id: string; label: string; displayOrder: number }>;
}

interface DealProperty {
  name: string;
  label: string;
}

interface HandoffPermissions {
  canManageSettings: boolean;
  canCreateTicket: boolean;
  isSuperAdmin: boolean;
}

type LoadState = "loading" | "ready" | "saving" | "error";

hubspot.extend<"settings">(() => <SettingsPage />);

function SettingsPage(): React.ReactElement {
  const context = useExtensionContext<"settings">();
  const portalId = context.portal.id;
  const [state, setState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<AppSettings>({
    enabled: true,
    requiredProperties: ["dealname", "amount", "closedate"],
    requireCompany: true,
    requireContact: true,
    ticketPipelineId: "",
    ticketStageId: "",
    ticketSubjectPrefix: "Customer handoff",
    routes: [defaultRoute()],
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pipelines, setPipelines] = useState<TicketPipeline[]>([]);
  const [projectPipelines, setProjectPipelines] = useState<TicketPipeline[]>(
    [],
  );
  const [dealProperties, setDealProperties] = useState<DealProperty[]>([]);
  const [permissions, setPermissions] = useState<HandoffPermissions | null>(
    null,
  );
  const [selectedRouteId, setSelectedRouteId] = useState("customer-success");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    setSaved(false);
    try {
      const [
        nextSettings,
        nextPipelines,
        nextProjectPipelines,
        nextPermissions,
        nextProperties,
      ] = await Promise.all([
        request<AppSettings>(portalId),
        loadTicketPipelines(portalId),
        loadProjectPipelines(portalId),
        loadAuthorization(portalId),
        loadDealProperties(portalId),
      ]);
      setSettings(nextSettings);
      setPipelines(nextPipelines);
      setProjectPipelines(nextProjectPipelines);
      setPermissions(nextPermissions);
      setDealProperties(nextProperties);
      setSelectedRouteId(nextSettings.routes[0]?.id ?? "customer-success");
      setSelectedTemplateId(nextSettings.routes[0]?.taskTemplates[0]?.id ?? "");
      setState("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setState("error");
    }
  }, [portalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    setState("saving");
    setError(null);
    setSaved(false);
    try {
      setSettings(
        await request<AppSettings>(portalId, {
          method: "PUT",
          body: settings,
        }),
      );
      setSaved(true);
      setState("ready");
    } catch (cause) {
      setError(messageFrom(cause));
      setState("error");
    }
  }

  const selectedRoute =
    settings.routes.find((route) => route.id === selectedRouteId) ??
    settings.routes[0];
  const selectedTemplate =
    selectedRoute?.taskTemplates.find(
      (template) => template.id === selectedTemplateId,
    ) ?? selectedRoute?.taskTemplates[0];
  const editable =
    state !== "saving" && Boolean(permissions?.canManageSettings);

  function updateRoute(patch: Partial<HandoffRoute>): void {
    if (!selectedRoute) return;
    setSettings({
      ...settings,
      routes: settings.routes.map((route) =>
        route.id === selectedRoute.id ? { ...route, ...patch } : route,
      ),
    });
  }

  function updateTaskTemplate(patch: Partial<HandoffTaskTemplate>): void {
    if (!selectedRoute || !selectedTemplate) return;
    updateRoute({
      taskTemplates: selectedRoute.taskTemplates.map((template) =>
        template.id === selectedTemplate.id
          ? { ...template, ...patch }
          : template,
      ),
    });
  }

  function addTaskTemplate(): void {
    if (!selectedRoute || selectedRoute.taskTemplates.length >= 20) return;
    let index = selectedRoute.taskTemplates.length + 1;
    while (
      selectedRoute.taskTemplates.some(
        (template) => template.id === `task-${index}`,
      )
    )
      index += 1;
    const template = taskTemplate(index);
    updateRoute({ taskTemplates: [...selectedRoute.taskTemplates, template] });
    setSelectedTemplateId(template.id);
  }

  function removeTaskTemplate(): void {
    if (
      !selectedRoute ||
      !selectedTemplate ||
      selectedRoute.taskTemplates.length <= 1
    )
      return;
    const taskTemplates = selectedRoute.taskTemplates.filter(
      (template) => template.id !== selectedTemplate.id,
    );
    updateRoute({ taskTemplates });
    setSelectedTemplateId(taskTemplates[0]?.id ?? "");
  }

  function duplicateTaskTemplate(): void {
    if (
      !selectedRoute ||
      !selectedTemplate ||
      selectedRoute.taskTemplates.length >= 20
    )
      return;
    let index = selectedRoute.taskTemplates.length + 1;
    while (
      selectedRoute.taskTemplates.some(
        (template) => template.id === `task-${index}`,
      )
    )
      index += 1;
    const copy = {
      ...selectedTemplate,
      id: `task-${index}`,
      name: `${selectedTemplate.name} copy`,
    };
    updateRoute({ taskTemplates: [...selectedRoute.taskTemplates, copy] });
    setSelectedTemplateId(copy.id);
  }

  function moveTaskTemplate(offset: -1 | 1): void {
    if (!selectedRoute || !selectedTemplate) return;
    const current = selectedRoute.taskTemplates.findIndex(
      (template) => template.id === selectedTemplate.id,
    );
    const next = current + offset;
    if (current < 0 || next < 0 || next >= selectedRoute.taskTemplates.length)
      return;
    const taskTemplates = [...selectedRoute.taskTemplates];
    [taskTemplates[current], taskTemplates[next]] = [
      taskTemplates[next] as HandoffTaskTemplate,
      taskTemplates[current] as HandoffTaskTemplate,
    ];
    updateRoute({ taskTemplates });
  }

  function addRoute(): void {
    const base = `route-${settings.routes.length + 1}`;
    let id = base;
    let suffix = 2;
    while (settings.routes.some((route) => route.id === id))
      id = `${base}-${suffix++}`;
    const route = {
      ...defaultRoute(),
      id,
      name: `New handoff route ${settings.routes.length + 1}`,
      department: "New department",
    };
    setSettings({ ...settings, routes: [...settings.routes, route] });
    setSelectedRouteId(id);
  }

  function removeRoute(): void {
    if (!selectedRoute || settings.routes.length === 1) return;
    const routes = settings.routes.filter(
      (route) => route.id !== selectedRoute.id,
    );
    setSettings({ ...settings, routes });
    setSelectedRouteId(routes[0]?.id ?? "");
  }

  function duplicateRoute(): void {
    if (!selectedRoute || settings.routes.length >= 12) return;
    const base = `${selectedRoute.id}-copy`;
    let id = base;
    let suffix = 2;
    while (settings.routes.some((route) => route.id === id))
      id = `${base}-${suffix++}`;
    const route = {
      ...selectedRoute,
      id,
      name: `${selectedRoute.name} copy`,
      taskTemplates: selectedRoute.taskTemplates.map((template) => ({
        ...template,
      })),
    };
    setSettings({ ...settings, routes: [...settings.routes, route] });
    setSelectedRouteId(id);
    setSelectedTemplateId(route.taskTemplates[0]?.id ?? "");
  }

  return (
    <Flex direction="column" gap="medium">
      <Heading>{"HandoffReady settings"}</Heading>
      <Text>
        Build portal-specific handoff routes for each receiving department.
        Every route controls its own requirements and creates a ticket, a task,
        or a project with a reusable task plan.
      </Text>
      {state === "loading" ? (
        <LoadingSpinner label="Loading settings" />
      ) : (
        <Flex direction="column" gap="small">
          {error ? (
            <Alert title="Settings could not be saved" variant="danger">
              {error}
            </Alert>
          ) : null}
          {saved ? (
            <Alert title="Settings saved" variant="success">
              The encrypted portal configuration is up to date.
            </Alert>
          ) : null}
          {permissions && !permissions.canManageSettings ? (
            <Alert title="Handoff settings are read-only" variant="info">
              A HubSpot Super Admin or a user listed in the deployment policy
              can change portal handoff routes.
            </Alert>
          ) : null}
          <Checkbox
            name="enabled"
            checked={settings.enabled}
            readOnly={state === "saving" || !permissions?.canManageSettings}
            onChange={(enabled) => setSettings({ ...settings, enabled })}
          >
            Enable handoff creation
          </Checkbox>
          {permissions?.isSuperAdmin ? (
            <Alert title="Super Admin access verified" variant="success">
              You can configure HandoffReady for this portal using your native
              HubSpot Super Admin access.
            </Alert>
          ) : null}
          <Flex direction="row" gap="small" align="end" wrap="wrap">
            <Select
              name="selectedRoute"
              label="Handoff route"
              description="Choose a route to edit. Users select from these routes on the deal card."
              value={selectedRoute?.id ?? ""}
              options={settings.routes.map((route) => ({
                label: `${route.department} — ${route.name}`,
                value: route.id,
              }))}
              onChange={(value) => {
                const route = settings.routes.find(
                  (item) => item.id === String(value),
                );
                setSelectedRouteId(String(value));
                setSelectedTemplateId(route?.taskTemplates[0]?.id ?? "");
              }}
            />
            <Button
              disabled={!editable || settings.routes.length >= 12}
              onClick={addRoute}
            >
              Add route
            </Button>
            <Button
              disabled={
                !editable || !selectedRoute || settings.routes.length >= 12
              }
              onClick={duplicateRoute}
            >
              Duplicate route
            </Button>
            <Button
              disabled={!editable || settings.routes.length === 1}
              onClick={removeRoute}
            >
              Remove route
            </Button>
          </Flex>
          {selectedRoute ? (
            <Flex direction="column" gap="small">
              <Input
                name="routeName"
                label="Route name"
                value={selectedRoute.name}
                readOnly={!editable}
                onInput={(value) => updateRoute({ name: String(value) })}
              />
              <Input
                name="department"
                label="Receiving department"
                value={selectedRoute.department}
                readOnly={!editable}
                onInput={(value) => updateRoute({ department: String(value) })}
              />
              <Input
                name="routeId"
                label="Route ID"
                description="Stable internal key used by workflows and stored handoff records."
                value={selectedRoute.id}
                readOnly
              />
              <Select
                name="outputType"
                label="Create in HubSpot"
                value={selectedRoute.outputType}
                readOnly={!editable}
                options={[
                  { label: "Ticket", value: "ticket" },
                  { label: "Task", value: "task" },
                  { label: "Project + tasks", value: "project_tasks" },
                ]}
                onChange={(value) => {
                  const outputType = String(value) as HandoffOutputType;
                  const taskTemplates =
                    outputType === "project_tasks" &&
                    selectedRoute.taskTemplates.length === 0
                      ? [
                          taskTemplate(1, "Kickoff {deal}"),
                          taskTemplate(2, "Confirm delivery plan"),
                        ]
                      : outputType === "task" &&
                          selectedRoute.taskTemplates.length === 0
                        ? [
                            taskTemplate(
                              1,
                              `${selectedRoute.subjectPrefix}: {deal}`,
                            ),
                          ]
                        : selectedRoute.taskTemplates;
                  updateRoute({
                    outputType,
                    pipelineId: "",
                    stageId: "",
                    taskTemplates,
                  });
                  setSelectedTemplateId(taskTemplates[0]?.id ?? "");
                }}
              />
              <Checkbox
                name="routeRequireCompany"
                checked={selectedRoute.requireCompany}
                readOnly={!editable}
                onChange={(requireCompany) => updateRoute({ requireCompany })}
              >
                Require an associated company
              </Checkbox>
              <Checkbox
                name="routeRequireContact"
                checked={selectedRoute.requireContact}
                readOnly={!editable}
                onChange={(requireContact) => updateRoute({ requireContact })}
              >
                Require an associated contact
              </Checkbox>
              <MultiSelect
                name="routeRequiredProperties"
                label="Required deal properties"
                description="Choose the fields sales must complete before this route can be created."
                value={selectedRoute.requiredProperties}
                options={dealProperties.map((property) => ({
                  label: property.label,
                  value: property.name,
                }))}
                readOnly={!editable}
                onChange={(value) =>
                  updateRoute({ requiredProperties: value.map(String) })
                }
              />
              {selectedRoute.outputType !== "task" ? (
                <>
                  <Select
                    name="ticketPipelineId"
                    label={
                      selectedRoute.outputType === "ticket"
                        ? "Ticket pipeline"
                        : "Project pipeline"
                    }
                    value={selectedRoute.pipelineId}
                    readOnly={!editable}
                    options={(selectedRoute.outputType === "ticket"
                      ? pipelines
                      : projectPipelines
                    ).map((pipeline) => ({
                      label: pipeline.label,
                      value: pipeline.id,
                    }))}
                    onChange={(value) => {
                      const pipelineId = String(value);
                      const pipeline = (
                        selectedRoute.outputType === "ticket"
                          ? pipelines
                          : projectPipelines
                      ).find((item) => item.id === pipelineId);
                      updateRoute({
                        pipelineId,
                        stageId:
                          pipeline?.stages
                            .slice()
                            .sort(
                              (left, right) =>
                                left.displayOrder - right.displayOrder,
                            )[0]?.id ?? "",
                      });
                    }}
                  />
                  <Select
                    name="ticketStageId"
                    label="Initial stage"
                    value={selectedRoute.stageId}
                    readOnly={!editable}
                    options={(
                      (selectedRoute.outputType === "ticket"
                        ? pipelines
                        : projectPipelines
                      ).find(
                        (pipeline) => pipeline.id === selectedRoute.pipelineId,
                      )?.stages ?? []
                    )
                      .slice()
                      .sort(
                        (left, right) => left.displayOrder - right.displayOrder,
                      )
                      .map((stage) => ({
                        label: stage.label,
                        value: stage.id,
                      }))}
                    onChange={(value) =>
                      updateRoute({ stageId: String(value) })
                    }
                  />
                </>
              ) : null}
              <Input
                name="ticketSubjectPrefix"
                label="Record name prefix"
                value={selectedRoute.subjectPrefix}
                readOnly={!editable}
                onInput={(value) =>
                  updateRoute({ subjectPrefix: String(value) })
                }
              />
              {selectedRoute.outputType === "task" ||
              selectedRoute.outputType === "project_tasks" ? (
                <Flex direction="column" gap="small">
                  <Flex direction="row" gap="small" align="end" wrap="wrap">
                    <Select
                      name="selectedTaskTemplate"
                      label={
                        selectedRoute.outputType === "task"
                          ? "Task template"
                          : "Project task plan"
                      }
                      description="Configure the exact task records HandoffReady creates. {deal} inserts the deal name and {date} inserts today's date."
                      value={selectedTemplate?.id ?? ""}
                      options={selectedRoute.taskTemplates.map(
                        (template, index) => ({
                          label: `${index + 1}. ${template.name}`,
                          value: template.id,
                        }),
                      )}
                      onChange={(value) => setSelectedTemplateId(String(value))}
                    />
                    <Button
                      disabled={
                        !editable ||
                        selectedRoute.outputType === "task" ||
                        selectedRoute.taskTemplates.length >= 20
                      }
                      onClick={addTaskTemplate}
                    >
                      Add task
                    </Button>
                    <Button
                      disabled={
                        !editable ||
                        selectedRoute.outputType === "task" ||
                        !selectedTemplate ||
                        selectedRoute.taskTemplates.length >= 20
                      }
                      onClick={duplicateTaskTemplate}
                    >
                      Duplicate
                    </Button>
                    <Button
                      disabled={
                        !editable || selectedRoute.taskTemplates.length <= 1
                      }
                      onClick={removeTaskTemplate}
                    >
                      Remove task
                    </Button>
                    <Button
                      disabled={
                        !editable ||
                        selectedRoute.outputType === "task" ||
                        !selectedTemplate ||
                        selectedRoute.taskTemplates[0]?.id ===
                          selectedTemplate.id
                      }
                      onClick={() => moveTaskTemplate(-1)}
                    >
                      Move up
                    </Button>
                    <Button
                      disabled={
                        !editable ||
                        selectedRoute.outputType === "task" ||
                        !selectedTemplate ||
                        selectedRoute.taskTemplates.at(-1)?.id ===
                          selectedTemplate.id
                      }
                      onClick={() => moveTaskTemplate(1)}
                    >
                      Move down
                    </Button>
                  </Flex>
                  {selectedTemplate ? (
                    <Flex direction="column" gap="small">
                      <Input
                        name="taskTemplateName"
                        label="Task name"
                        value={selectedTemplate.name}
                        readOnly={!editable}
                        onInput={(value) =>
                          updateTaskTemplate({ name: String(value) })
                        }
                      />
                      <TextArea
                        name="taskTemplateDescription"
                        label="Task description"
                        value={selectedTemplate.description}
                        rows={4}
                        maxLength={2000}
                        readOnly={!editable}
                        onInput={(value) =>
                          updateTaskTemplate({ description: String(value) })
                        }
                      />
                      <Flex direction="row" gap="small">
                        <Select
                          name="taskTemplateStatus"
                          label="Default status"
                          value={selectedTemplate.status}
                          readOnly={!editable}
                          options={[
                            { label: "Not started", value: "NOT_STARTED" },
                            { label: "Completed", value: "COMPLETED" },
                          ]}
                          onChange={(value) =>
                            updateTaskTemplate({
                              status: String(
                                value,
                              ) as HandoffTaskTemplate["status"],
                            })
                          }
                        />
                        <Select
                          name="taskTemplatePriority"
                          label="Priority"
                          value={selectedTemplate.priority}
                          readOnly={!editable}
                          options={[
                            { label: "Low", value: "LOW" },
                            { label: "Medium", value: "MEDIUM" },
                            { label: "High", value: "HIGH" },
                          ]}
                          onChange={(value) =>
                            updateTaskTemplate({
                              priority: String(
                                value,
                              ) as HandoffTaskTemplate["priority"],
                            })
                          }
                        />
                        <NumberInput
                          name="taskTemplateDueInDays"
                          label="Due in days"
                          description="0 means today."
                          value={selectedTemplate.dueInDays}
                          min={0}
                          max={365}
                          precision={0}
                          readOnly={!editable}
                          onChange={(value) =>
                            updateTaskTemplate({ dueInDays: value })
                          }
                        />
                      </Flex>
                    </Flex>
                  ) : null}
                </Flex>
              ) : null}
            </Flex>
          ) : null}
          <Button
            variant="primary"
            disabled={
              state === "saving" ||
              !permissions?.canManageSettings ||
              !selectedRoute ||
              settings.routes.some(
                (route) =>
                  !route.name.trim() ||
                  !route.department.trim() ||
                  !route.subjectPrefix.trim() ||
                  (["task", "project_tasks"].includes(route.outputType) &&
                    route.taskTemplates.length === 0),
              )
            }
            onClick={() => void save()}
          >
            {state === "saving" ? "Saving..." : "Save settings"}
          </Button>
          {state === "error" ? (
            <Button onClick={() => void load()}>Try again</Button>
          ) : null}
        </Flex>
      )}
    </Flex>
  );
}

async function loadTicketPipelines(
  portalId: number,
): Promise<TicketPipeline[]> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/ticket-pipelines?portalId=${portalId}`,
  );
  const body = (await response.json()) as {
    results?: TicketPipeline[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body.results ?? [];
}

async function loadProjectPipelines(
  portalId: number,
): Promise<TicketPipeline[]> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/project-pipelines?portalId=${portalId}`,
  );
  const body = (await response.json()) as {
    results?: TicketPipeline[];
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  return body.results ?? [];
}

async function loadAuthorization(
  portalId: number,
): Promise<HandoffPermissions> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/authorization?portalId=${portalId}`,
  );
  const body = (await response.json()) as HandoffPermissions & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body;
}

async function loadDealProperties(portalId: number): Promise<DealProperty[]> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/deal-properties?portalId=${portalId}`,
  );
  const body = (await response.json()) as {
    results?: DealProperty[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body.results ?? [];
}

async function request<Value>(
  portalId: number,
  options?: { method: "PUT"; body: AppSettings },
): Promise<Value> {
  const response = await hubspot.fetch(
    `${API_ORIGIN}/api/settings?portalId=${portalId}`,
    options
      ? {
          method: options.method,
          body: { ...options.body },
        }
      : undefined,
  );
  const body = (await response.json()) as Value & { error?: string };
  if (!response.ok) {
    throw new Error(
      body.error ?? `Request failed with status ${response.status}.`,
    );
  }
  return body;
}

function messageFrom(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "An unexpected error occurred.";
}

function defaultRoute(): HandoffRoute {
  return {
    id: "customer-success",
    name: "Customer success handoff",
    department: "Customer Success",
    outputType: "ticket",
    requiredProperties: ["dealname", "amount", "closedate"],
    requireCompany: true,
    requireContact: true,
    pipelineId: "",
    stageId: "",
    subjectPrefix: "Customer handoff",
    taskTemplates: [],
  };
}

function taskTemplate(
  index: number,
  name = `Task ${index}`,
): HandoffTaskTemplate {
  return {
    id: `task-${index}`,
    name,
    description: "Created by HandoffReady for {deal}.",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    dueInDays: index,
  };
}
