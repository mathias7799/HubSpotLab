const standardObjectTypeIds: Readonly<Record<string, string>> = {
  contacts: "0-1",
  companies: "0-2",
  deals: "0-3",
  tickets: "0-5",
  projects: "0-970",
  tasks: "0-27",
};

/**
 * Builds a HubSpot record URL through HubSpot's region-routing app origin.
 * Numeric object type IDs are accepted so future/custom CRM object
 * associations can use the same link helper.
 */
export function crmRecordPath(
  portalId: number,
  objectType: string,
  recordId: string,
): string | null {
  const normalizedType = objectType.trim().toLowerCase();
  const objectTypeId =
    standardObjectTypeIds[normalizedType] ??
    (isObjectTypeId(normalizedType) ? normalizedType : null);
  const normalizedRecordId = recordId.trim();

  if (!objectTypeId || !normalizedRecordId || !Number.isInteger(portalId)) {
    return null;
  }

  return `https://app.hubspot.com/contacts/${portalId}/record/${encodeURIComponent(objectTypeId)}/${encodeURIComponent(normalizedRecordId)}`;
}

function isObjectTypeId(value: string): boolean {
  return /^\d+-\d+$/.test(value);
}
