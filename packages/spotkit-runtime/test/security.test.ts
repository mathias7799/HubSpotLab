import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertHubSpotRequest,
  decodeHubSpotUri,
  SecurityError,
} from "../src/index.js";
import { runtimeConfig } from "./helpers.js";

function signedRequest(url: string, body: string, timestamp: number): Request {
  const source = `POST${decodeHubSpotUri(url)}${body}${timestamp}`;
  const signature = createHmac("sha256", "client-secret")
    .update(source)
    .digest("base64");
  return new Request(url, {
    method: "POST",
    headers: {
      "x-hubspot-signature-v3": signature,
      "x-hubspot-request-timestamp": String(timestamp),
    },
  });
}

describe("assertHubSpotRequest", () => {
  it("accepts a current valid v3 signature including HubSpot URI decoding", async () => {
    const now = Date.now();
    const url = "https://example.test/api/deals%2F123?name=ACME%20Inc";
    await expect(
      assertHubSpotRequest(
        signedRequest(url, '{"ok":true}', now),
        runtimeConfig(),
        '{"ok":true}',
        now,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects missing, expired, and invalid signatures", async () => {
    const now = Date.now();
    await expect(
      assertHubSpotRequest(
        new Request("https://example.test/api"),
        runtimeConfig(),
        "",
        now,
      ),
    ).rejects.toBeInstanceOf(SecurityError);
    await expect(
      assertHubSpotRequest(
        signedRequest("https://example.test/api", "", now - 300_001),
        runtimeConfig(),
        "",
        now,
      ),
    ).rejects.toThrow("Expired");
    const invalid = new Request("https://example.test/api", {
      headers: {
        "x-hubspot-signature-v3": "invalid",
        "x-hubspot-request-timestamp": String(now),
      },
    });
    await expect(
      assertHubSpotRequest(invalid, runtimeConfig(), "", now),
    ).rejects.toThrow("Invalid");
  });

  it("bypasses signatures only for an explicitly enabled local URL", async () => {
    const request = new Request("http://localhost:8788/api");
    await expect(
      assertHubSpotRequest(
        request,
        runtimeConfig({
          publicUrl: "http://localhost:8788",
          allowUnsignedDevelopmentRequests: true,
          upstashUrl: undefined,
          upstashToken: undefined,
        }),
        "",
      ),
    ).resolves.toBeUndefined();
  });
});
