import { HttpError, type RuntimeApiContext } from "@hubspotlab/spotkit-runtime";

export interface SendAppEventInput {
  portalId: number;
  /** Use the event name assigned by HubSpot after the component is uploaded. */
  eventName: string;
  objectId: string;
  occurredAt?: Date;
  properties: Record<string, string>;
}

export async function sendAppEvent(
  input: SendAppEventInput,
  context: RuntimeApiContext,
): Promise<void> {
  if (!Number.isInteger(input.portalId) || input.portalId <= 0) {
    throw new HttpError(400, "A valid portalId is required.");
  }
  if (!input.eventName.trim() || !input.objectId.trim()) {
    throw new HttpError(400, "App events require eventName and objectId.");
  }
  const accessToken = await context.accessTokenForPortal(input.portalId);
  const response = await context.fetcher("https://api.hubapi.com/events/v3/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventName: input.eventName,
      objectId: input.objectId,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      properties: input.properties,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new HttpError(
      response.status >= 500 ? 502 : response.status,
      body.message ?? `HubSpot app event failed with status ${response.status}.`,
    );
  }
}
