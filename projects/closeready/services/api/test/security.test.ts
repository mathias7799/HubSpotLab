import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { AppConfig } from "../src/config.js";
import { assertHubSpotRequest } from "../src/security.js";

const config = {
  clientSecret: "test-secret",
  allowUnsignedDevelopmentRequests: false,
} as AppConfig;

describe("HubSpot request signatures", () => {
  it.each(["decoded", "raw"])(
    "accepts the %s URI representation used by HubSpot fetch",
    async (representation) => {
      const url = "https://api.example.com/api/rules/new%3A123?portalId=1";
      const timestamp = String(Date.now());
      const signedUrl = representation === "decoded" ? url.replace("%3A", ":") : url;
      const source = `DELETE${signedUrl}${timestamp}`;
      const signature = createHmac("sha256", config.clientSecret)
        .update(source)
        .digest("base64");
      const request = new Request(url, {
        method: "DELETE",
        headers: {
          "x-hubspot-request-timestamp": timestamp,
          "x-hubspot-signature-v3": signature,
        },
      });

      await expect(
        assertHubSpotRequest(request, config, ""),
      ).resolves.toBeUndefined();
    },
  );
});
