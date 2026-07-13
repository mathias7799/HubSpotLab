import { describe, expect, it } from "vitest";

import { crmRecordPath } from "./recordLinks.ts";

describe("crmRecordPath", () => {
  it.each([
    ["contacts", "0-1"],
    ["companies", "0-2"],
    ["deals", "0-3"],
    ["tickets", "0-5"],
    ["projects", "0-970"],
    ["tasks", "0-27"],
  ])("links %s to its HubSpot record", (objectType, objectTypeId) => {
    expect(crmRecordPath(148692618, objectType, "12345")).toBe(
      `https://app.hubspot.com/contacts/148692618/record/${objectTypeId}/12345`,
    );
  });

  it("supports explicit object type IDs for future and custom CRM objects", () => {
    expect(crmRecordPath(148692618, "2-123456", "789")).toBe(
      "https://app.hubspot.com/contacts/148692618/record/2-123456/789",
    );
  });

  it("does not create a misleading link for an unknown object API name", () => {
    expect(crmRecordPath(148692618, "unknown", "789")).toBeNull();
  });
});
