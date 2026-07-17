import { createHmac } from "node:crypto";

import { isLocalHostname, type RuntimeConfig } from "./config.js";
import { safeEqual } from "./crypto.js";

export async function assertHubSpotRequest(
  request: Request,
  config: RuntimeConfig,
  rawBody: string,
  now = Date.now(),
): Promise<void> {
  if (
    config.allowUnsignedDevelopmentRequests &&
    isLocalHostname(new URL(request.url).hostname)
  ) {
    return;
  }
  const signature = request.headers.get("x-hubspot-signature-v3");
  const timestamp = request.headers.get("x-hubspot-request-timestamp");
  if (!signature || !timestamp) {
    throw new SecurityError("Missing HubSpot signature.");
  }
  const timestampMs = Number(timestamp);
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - timestampMs) > 300_000) {
    throw new SecurityError("Expired HubSpot signature.");
  }
  const candidates = [...new Set([decodeHubSpotUri(request.url), request.url])];
  const valid = candidates.some((uri) => {
    const source = `${request.method}${uri}${rawBody}${timestamp}`;
    const expected = createHmac("sha256", config.clientSecret)
      .update(source)
      .digest("base64");
    return safeEqual(expected, signature);
  });
  if (!valid) throw new SecurityError("Invalid HubSpot signature.");
}

export class SecurityError extends Error {
  override name = "SecurityError";
}

export function decodeHubSpotUri(uri: string): string {
  const replacements: Record<string, string> = {
    "%21": "!",
    "%24": "$",
    "%27": "'",
    "%28": "(",
    "%29": ")",
    "%2A": "*",
    "%2C": ",",
    "%2F": "/",
    "%3A": ":",
    "%3B": ";",
    "%3D": "=",
    "%3F": "?",
    "%40": "@",
  };
  return uri.replace(
    /%21|%24|%27|%28|%29|%2A|%2C|%2F|%3A|%3B|%3D|%3F|%40/gi,
    (value) => replacements[value.toUpperCase()] ?? value,
  );
}
