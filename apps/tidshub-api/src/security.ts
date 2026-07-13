import { createHmac, timingSafeEqual } from "node:crypto";

import type { AppConfig } from "./config.js";

export async function assertHubSpotRequest(
  request: Request,
  config: AppConfig,
  rawBody: string,
): Promise<void> {
  if (
    config.allowUnsignedDevelopmentRequests &&
    new URL(request.url).hostname === "localhost"
  ) {
    return;
  }

  const signature = request.headers.get("x-hubspot-signature-v3");
  const timestamp = request.headers.get("x-hubspot-request-timestamp");
  if (!signature || !timestamp)
    throw new SecurityError("Missing HubSpot signature.");
  const timestampMs = Number(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > 300_000
  ) {
    throw new SecurityError("Expired HubSpot signature.");
  }
  const source = `${request.method}${decodeUri(request.url)}${rawBody}${timestamp}`;
  const expected = createHmac("sha256", config.clientSecret)
    .update(source)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new SecurityError("Invalid HubSpot signature.");
  }
}

export class SecurityError extends Error {}

function decodeUri(uri: string): string {
  return uri
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/")
    .replace(/%3F/gi, "?")
    .replace(/%40/gi, "@");
}
