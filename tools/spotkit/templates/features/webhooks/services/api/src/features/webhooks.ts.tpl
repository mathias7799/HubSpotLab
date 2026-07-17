import { HttpError, type RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

export interface HubSpotWebhookEvent {
  eventId: string | number;
  subscriptionId: string | number;
  portalId: number;
  occurredAt: number;
  subscriptionType: string;
  objectId?: string | number;
  propertyName?: string;
  propertyValue?: string;
  attemptNumber?: number;
}

export async function handleHubSpotWebhooks(
  request: Request,
  context: RuntimeApiContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/webhooks/hubspot") return null;
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const rawBody = await request.text();
  await context.verifyRequest(request, rawBody);
  const events = readEvents(rawBody);
  for (const event of events) {
    const key = `webhook:${event.portalId}:${event.subscriptionId}:${event.eventId}`;
    if (!(await context.idempotency.claim(key, 604_800))) continue;
    try {
      await onHubSpotWebhookEvent(event, context);
    } catch (cause) {
      await context.idempotency.release(key);
      throw cause;
    }
  }
  return new Response(null, { status: 204 });
}

/** Replace this implementation with a fast, retry-safe domain operation. */
export async function onHubSpotWebhookEvent(
  event: HubSpotWebhookEvent,
  _context: RuntimeApiContext,
): Promise<void> {
  console.info("HubSpot webhook received", {
    eventId: event.eventId,
    portalId: event.portalId,
    subscriptionType: event.subscriptionType,
    objectId: event.objectId,
  });
}

function readEvents(rawBody: string): HubSpotWebhookEvent[] {
  let value: unknown;
  try {
    value = JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError(400, "Webhook body must be valid JSON.");
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new HttpError(400, "Webhook body must contain between 1 and 100 events.");
  }
  return value.map((event) => {
    if (
      typeof event !== "object" ||
      event === null ||
      !("eventId" in event) ||
      !("subscriptionId" in event) ||
      !("portalId" in event) ||
      !Number.isInteger(event.portalId) ||
      !("occurredAt" in event) ||
      !Number.isFinite(event.occurredAt) ||
      !("subscriptionType" in event) ||
      typeof event.subscriptionType !== "string"
    ) {
      throw new HttpError(400, "Webhook event is missing required HubSpot fields.");
    }
    return event as HubSpotWebhookEvent;
  });
}
