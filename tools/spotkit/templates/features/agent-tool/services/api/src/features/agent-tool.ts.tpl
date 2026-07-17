import { HttpError, type RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

interface AgentToolExecution {
  callbackId: string;
  portalId: number;
  inputFields: Record<string, unknown>;
}

export async function handleExampleAgentTool(
  request: Request,
  context: RuntimeApiContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/workflow-actions/agent-tool") return null;
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const rawBody = await request.text();
  await context.verifyRequest(request, rawBody);
  const execution = readExecution(rawBody);
  const key = `agent-tool:${execution.portalId}:${execution.callbackId}`;
  if (!(await context.idempotency.claim(key, 604_800))) {
    return Response.json({ outputFields: { result: "Already processed" } });
  }
  try {
    const result = await onExampleAgentTool(execution, context);
    return Response.json({ outputFields: { result } });
  } catch (cause) {
    await context.idempotency.release(key);
    throw cause;
  }
}

/** Replace with a narrowly scoped tool. Validate inputs before external writes. */
export async function onExampleAgentTool(
  execution: AgentToolExecution,
  _context: RuntimeApiContext,
): Promise<string> {
  const instruction = execution.inputFields.instruction;
  if (typeof instruction !== "string" || !instruction.trim()) {
    throw new HttpError(400, "Agent tool instruction is required.");
  }
  return `Accepted: ${instruction.trim().slice(0, 120)}`;
}

function readExecution(rawBody: string): AgentToolExecution {
  let value: unknown;
  try {
    value = JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError(400, "Agent tool body must be valid JSON.");
  }
  if (typeof value !== "object" || value === null) {
    throw new HttpError(400, "Agent tool body is invalid.");
  }
  const body = value as Record<string, unknown>;
  const origin = body.origin;
  if (
    (typeof body.callbackId !== "string" && typeof body.callbackId !== "number") ||
    typeof origin !== "object" ||
    origin === null ||
    !("portalId" in origin) ||
    !Number.isInteger(origin.portalId) ||
    typeof body.inputFields !== "object" ||
    body.inputFields === null
  ) {
    throw new HttpError(400, "Agent tool body is missing required HubSpot fields.");
  }
  return {
    callbackId: String(body.callbackId),
    portalId: origin.portalId as number,
    inputFields: body.inputFields as Record<string, unknown>,
  };
}
