import { HttpError, type RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

export interface WorkflowActionExecution {
  callbackId: string;
  portalId: number;
  objectId: string;
  objectType: string;
  inputFields: Record<string, unknown>;
}

export async function handleExampleWorkflowAction(
  request: Request,
  context: RuntimeApiContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/workflow-actions/example") return null;
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const rawBody = await request.text();
  await context.verifyRequest(request, rawBody);
  const execution = readExecution(rawBody);
  const key = `workflow-action:${execution.portalId}:${execution.callbackId}`;
  if (!(await context.idempotency.claim(key, 604_800))) {
    return Response.json({ outputFields: { status: "already_processed" } });
  }
  try {
    await onExampleWorkflowAction(execution, context);
  } catch (cause) {
    await context.idempotency.release(key);
    throw cause;
  }
  return Response.json({ outputFields: { status: "completed" } });
}

/** Replace this implementation with the action's retry-safe domain logic. */
export async function onExampleWorkflowAction(
  execution: WorkflowActionExecution,
  _context: RuntimeApiContext,
): Promise<void> {
  console.info("Workflow action executed", {
    callbackId: execution.callbackId,
    portalId: execution.portalId,
    objectId: execution.objectId,
    objectType: execution.objectType,
  });
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
  if (
    (typeof body.callbackId !== "string" && typeof body.callbackId !== "number") ||
    typeof origin !== "object" ||
    origin === null ||
    !("portalId" in origin) ||
    !Number.isInteger(origin.portalId) ||
    typeof object !== "object" ||
    object === null ||
    !("objectId" in object) ||
    !("objectType" in object) ||
    typeof object.objectType !== "string" ||
    typeof body.inputFields !== "object" ||
    body.inputFields === null
  ) {
    throw new HttpError(400, "Workflow action body is missing required HubSpot fields.");
  }
  return {
    callbackId: String(body.callbackId),
    portalId: origin.portalId as number,
    objectId: String(object.objectId),
    objectType: object.objectType,
    inputFields: body.inputFields as Record<string, unknown>,
  };
}
