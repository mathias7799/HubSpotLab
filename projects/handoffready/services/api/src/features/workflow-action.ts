import { HttpError, type RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

import {
  createHandoffTicket,
  evaluateHandoff,
  getHandoffSettings,
} from "../handoff.js";

export interface WorkflowActionExecution {
  callbackId: string;
  portalId: number;
  objectId: string;
  objectType: "DEAL";
  mode: "evaluate" | "create_ticket";
}

export async function handleHandoffWorkflowAction(
  request: Request,
  context: RuntimeApiContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/workflow-actions/prepare-handoff") return null;
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const rawBody = await request.text();
  await context.verifyRequest(request, rawBody);
  requireJsonRequest(request);
  const execution = readExecution(rawBody);
  const key = `workflow-action:${execution.portalId}:${execution.callbackId}`;
  if (!(await context.idempotency.claim(key, 604_800))) {
    return Response.json({ outputFields: { status: "already_processed" } });
  }
  try {
    const result = await onHandoffWorkflowAction(execution, context);
    return Response.json({
      outputFields: {
        status: result.complete
          ? "complete"
          : result.prerequisitesReady
            ? "ready_for_ticket"
            : "blocked",
        missing_count: result.items.filter((item) => !item.passed).length,
        ticket_id: result.ticketId ?? "",
      },
    });
  } catch (cause) {
    await context.idempotency.release(key);
    throw cause;
  }
}

export async function onHandoffWorkflowAction(
  execution: WorkflowActionExecution,
  context: RuntimeApiContext,
) {
  const settings = await getHandoffSettings(context, execution.portalId);
  if (execution.mode === "create_ticket") {
    return createHandoffTicket(
      context,
      execution.portalId,
      execution.objectId,
      settings,
    );
  }
  return evaluateHandoff(
    context,
    execution.portalId,
    execution.objectId,
    settings,
  );
}

function requireJsonRequest(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
}

function readExecution(rawBody: string): WorkflowActionExecution {
  let value: unknown;
  try {
    value = JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError(400, "Workflow action body must be valid JSON.");
  }
  if (typeof value !== "object" || value === null) {
    throw new HttpError(400, "Workflow action body is invalid.");
  }
  const body = value as Record<string, unknown>;
  const origin = body.origin;
  const object = body.object;
  const inputFields = body.inputFields;
  if (
    (typeof body.callbackId !== "string" &&
      typeof body.callbackId !== "number") ||
    typeof origin !== "object" ||
    origin === null ||
    !("portalId" in origin) ||
    !Number.isInteger(origin.portalId) ||
    typeof object !== "object" ||
    object === null ||
    !("objectId" in object) ||
    !("objectType" in object) ||
    object.objectType !== "DEAL" ||
    typeof inputFields !== "object" ||
    inputFields === null ||
    !("mode" in inputFields) ||
    !["evaluate", "create_ticket"].includes(String(inputFields.mode))
  ) {
    throw new HttpError(
      400,
      "Workflow action requires a deal and an evaluate or create_ticket mode.",
    );
  }
  return {
    callbackId: String(body.callbackId),
    portalId: origin.portalId as number,
    objectId: String(object.objectId),
    objectType: "DEAL",
    mode: String(inputFields.mode) as "evaluate" | "create_ticket",
  };
}
