import { createHmac, timingSafeEqual } from "node:crypto";

import type { AppConfig } from "./config.js";

export async function assertHubSpotRequest(
  request: Request,
  config: AppConfig,
  rawBody: string,
): Promise<void> {
  if (
    config.allowUnsignedDevelopmentRequests &&
    ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname)
  )
    return;
  const signature = request.headers.get("x-hubspot-signature-v3");
  const timestamp = request.headers.get("x-hubspot-request-timestamp");
  if (!signature || !timestamp)
    throw new SecurityError("Missing HubSpot signature.");
  if (Math.abs(Date.now() - Number(timestamp)) > 300_000) {
    throw new SecurityError("Expired HubSpot signature.");
  }
  const actual = Buffer.from(signature);
  const uris = [...new Set([decodeUri(request.url), request.url])];
  const valid = uris.some((uri) => {
    const source = `${request.method}${uri}${rawBody}${timestamp}`;
    const expected = Buffer.from(
      createHmac("sha256", config.clientSecret).update(source).digest("base64"),
    );
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  });
  if (!valid) {
    throw new SecurityError("Invalid HubSpot signature.");
  }
}

export class SecurityError extends Error {
  override name = "SecurityError";
}

function decodeUri(uri: string): string {
  return uri
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/")
    .replace(/%3F/gi, "?")
    .replace(/%40/gi, "@");
}
