import { hubspot } from "@hubspot/ui-extensions";

const BACKEND_URL =
  "https://c00cc054661d9a6c-185-229-152-184.serveousercontent.com";

export interface TidsHubSchema {
  fullyQualifiedName: string;
  objectTypeId: string;
  primaryDisplayProperty: string;
}

export type SchemaStatus = "checking" | "ready" | "creating" | "error";

export async function ensureSchema(portalId: number): Promise<TidsHubSchema> {
  const response = await hubspot.fetch(
    `${BACKEND_URL}/api/provision?portalId=${portalId}`,
    { method: "POST", body: {} },
  );
  const body = (await response.json()) as Partial<TidsHubSchema> & {
    error?: string;
  };
  if (
    !response.ok ||
    typeof body.fullyQualifiedName !== "string" ||
    typeof body.objectTypeId !== "string" ||
    typeof body.primaryDisplayProperty !== "string"
  ) {
    throw new Error(body.error ?? `TidsHub API-fejl ${response.status}`);
  }
  return body as TidsHubSchema;
}

export const createSchema = ensureSchema;
