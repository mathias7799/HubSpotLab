import { createHash } from "node:crypto";

import {
  parseConfigurationValue,
  serializeConfigurationValue,
  type ConfigurationStore,
  type JsonValue,
} from "./configuration-store.js";
import { seal, unseal } from "./crypto.js";

export interface HubSpotObjectConfigurationStoreOptions {
  appName: string;
  namespace: string;
  encryptionKey: string;
  accessTokenForPortal: (portalId: number) => Promise<string>;
  fetcher?: typeof fetch;
}

interface ConfigurationSchema {
  fullyQualifiedName: string;
}

interface ConfigurationRecord {
  id: string;
  properties?: Record<string, string | null>;
}

export class HubSpotObjectConfigurationStore implements ConfigurationStore {
  readonly #appName: string;
  readonly #namespace: string;
  readonly #objectName: string;
  readonly #encryptionKey: string;
  readonly #accessTokenForPortal: (portalId: number) => Promise<string>;
  readonly #fetcher: typeof fetch;
  readonly #schemas = new Map<number, ConfigurationSchema>();
  readonly #provisions = new Map<number, Promise<ConfigurationSchema>>();

  constructor(options: HubSpotObjectConfigurationStoreOptions) {
    this.#appName = options.appName.trim();
    this.#namespace = options.namespace;
    this.#objectName = objectName(options.namespace);
    this.#encryptionKey = options.encryptionKey;
    this.#accessTokenForPortal = options.accessTokenForPortal;
    this.#fetcher = options.fetcher ?? fetch;
    if (!this.#appName) throw new Error("appName must not be empty.");
  }

  async provision(portalId: number): Promise<ConfigurationSchema> {
    assertPortalId(portalId);
    const existing = this.#schemas.get(portalId);
    if (existing) return existing;
    const active = this.#provisions.get(portalId);
    if (active) return active;
    const provision = this.#provision(portalId).finally(() => {
      this.#provisions.delete(portalId);
    });
    this.#provisions.set(portalId, provision);
    const schema = await provision;
    this.#schemas.set(portalId, schema);
    return schema;
  }

  async get<Value extends JsonValue = JsonValue>(
    portalId: number,
    key: string,
  ): Promise<Value | null> {
    assertKey(key);
    const record = await this.find(portalId, key);
    const encrypted = record?.properties?.encrypted_value;
    if (!encrypted) return null;
    return parseConfigurationValue(
      unseal(encrypted, this.#encryptionKey, this.context(portalId, key)),
    ) as Value;
  }

  async put(portalId: number, key: string, value: JsonValue): Promise<void> {
    assertKey(key);
    const schema = await this.provision(portalId);
    const encrypted = seal(
      serializeConfigurationValue(value),
      this.#encryptionKey,
      this.context(portalId, key),
    );
    if (Buffer.byteLength(encrypted, "utf8") > 65_536) {
      throw new Error(
        "Encrypted HubSpot configuration value must not exceed 64 KiB.",
      );
    }
    const record = await this.search(portalId, schema, key);
    const properties = { config_key: key, encrypted_value: encrypted };
    if (record) {
      await this.update(portalId, schema, record.id, properties);
      return;
    }
    try {
      await this.request(
        portalId,
        `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}`,
        { method: "POST", body: JSON.stringify({ properties }) },
      );
    } catch (cause) {
      if (
        !(cause instanceof HubSpotConfigurationError) ||
        cause.status !== 409
      ) {
        throw cause;
      }
      const raced = await this.search(portalId, schema, key);
      if (!raced) throw cause;
      await this.update(portalId, schema, raced.id, properties);
    }
  }

  async delete(portalId: number, key: string): Promise<void> {
    assertKey(key);
    const schema = await this.provision(portalId);
    const record = await this.search(portalId, schema, key);
    if (!record) return;
    await this.request(
      portalId,
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}/${encodeURIComponent(record.id)}`,
      { method: "DELETE" },
    );
  }

  private async find(
    portalId: number,
    key: string,
  ): Promise<ConfigurationRecord | null> {
    return this.search(portalId, await this.provision(portalId), key);
  }

  private async update(
    portalId: number,
    schema: ConfigurationSchema,
    recordId: string,
    properties: Record<string, string>,
  ): Promise<void> {
    await this.request(
      portalId,
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}/${encodeURIComponent(recordId)}`,
      { method: "PATCH", body: JSON.stringify({ properties }) },
    );
  }

  private async search(
    portalId: number,
    schema: ConfigurationSchema,
    key: string,
  ): Promise<ConfigurationRecord | null> {
    const response = await this.request<{ results?: ConfigurationRecord[] }>(
      portalId,
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: "config_key", operator: "EQ", value: key },
              ],
            },
          ],
          properties: ["config_key", "encrypted_value"],
          limit: 1,
        }),
      },
    );
    return response.results?.[0] ?? null;
  }

  async #provision(portalId: number): Promise<ConfigurationSchema> {
    const existing = await this.findExistingSchema(portalId);
    if (existing) return existing;
    try {
      const created = await this.request<Record<string, unknown>>(
        portalId,
        "/crm-object-schemas/v3/schemas",
        { method: "POST", body: JSON.stringify(this.schemaDefinition) },
      );
      return normalizeSchema(created);
    } catch (cause) {
      if (
        cause instanceof HubSpotConfigurationError &&
        (cause.status === 401 ||
          cause.status === 403 ||
          cause.message.toLowerCase().includes("scope"))
      ) {
        throw new HubSpotConfigurationError(
          403,
          "One-object storage requires crm.schemas.custom.read, crm.objects.custom.read, and crm.objects.custom.write. Reauthorize the app with those scopes or keep the default Upstash configuration store.",
        );
      }
      if (
        !(cause instanceof HubSpotConfigurationError) ||
        cause.status !== 409
      ) {
        throw cause;
      }
      const raced = await this.findExistingSchema(portalId);
      if (raced) return raced;
      throw cause;
    }
  }

  private async findExistingSchema(
    portalId: number,
  ): Promise<ConfigurationSchema | null> {
    const response = await this.request<{ results?: unknown[] }>(
      portalId,
      "/crm-object-schemas/v3/schemas",
    );
    for (const candidate of response.results ?? []) {
      if (typeof candidate !== "object" || candidate === null) continue;
      const schema = candidate as Record<string, unknown>;
      if (schema.name === this.#objectName) return normalizeSchema(schema);
    }
    return null;
  }

  private get schemaDefinition(): Record<string, unknown> {
    return {
      name: this.#objectName,
      labels: {
        singular: `${this.#appName} configuration`,
        plural: `${this.#appName} configurations`,
      },
      primaryDisplayProperty: "config_key",
      properties: [
        {
          name: "config_key",
          label: "Configuration key",
          type: "string",
          fieldType: "text",
          hasUniqueValue: true,
        },
        {
          name: "encrypted_value",
          label: "Encrypted configuration value",
          type: "string",
          fieldType: "textarea",
        },
      ],
    };
  }

  private context(portalId: number, key: string): string {
    return `${this.#namespace}:hubspot-configuration:${portalId}:${key}`;
  }

  private async request<Value = unknown>(
    portalId: number,
    path: string,
    init: RequestInit = {},
  ): Promise<Value> {
    assertPortalId(portalId);
    const token = await this.#accessTokenForPortal(portalId);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");
    const response = await this.#fetcher(`https://api.hubapi.com${path}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new HubSpotConfigurationError(
          502,
          "HubSpot returned an invalid JSON response.",
        );
      }
    }
    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string"
          ? body.message
          : `HubSpot API failed with status ${response.status}.`;
      throw new HubSpotConfigurationError(response.status, message);
    }
    return body as Value;
  }
}

export class HubSpotConfigurationError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function normalizeSchema(value: Record<string, unknown>): ConfigurationSchema {
  if (typeof value.fullyQualifiedName !== "string") {
    throw new HubSpotConfigurationError(
      502,
      "HubSpot returned an incomplete configuration schema.",
    );
  }
  return { fullyQualifiedName: value.fullyQualifiedName };
}

function objectName(namespace: string): string {
  const base = `${namespace.replaceAll("-", "_")}_configuration`;
  if (!/^[a-z][a-z0-9_]*$/.test(base)) {
    throw new Error("namespace must be lowercase kebab-case.");
  }
  if (base.length <= 48) return base;
  const suffix = createHash("sha256").update(base).digest("hex").slice(0, 8);
  return `${base.slice(0, 39)}_${suffix}`;
}

function assertPortalId(portalId: number): void {
  if (!Number.isInteger(portalId) || portalId <= 0) {
    throw new Error("Configuration portalId must be a positive integer.");
  }
}

function assertKey(key: string): void {
  if (!/^[a-z][a-z0-9._-]{0,127}$/.test(key)) {
    throw new Error(
      "Configuration key must start with a lowercase letter and use only lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
}
