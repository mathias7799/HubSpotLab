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
  keyProperty: string;
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
    const record = await this.findByKey(portalId, schema, key);
    const properties = {
      [schema.keyProperty]: key,
      encrypted_value: encrypted,
    };
    if (record) {
      await this.update(portalId, schema, record.id, properties);
      return;
    }
    try {
      await this.createRecord(portalId, schema, properties);
    } catch (cause) {
      if (
        cause instanceof HubSpotConfigurationError &&
        cause.status === 400 &&
        cause.message.toLowerCase().includes("required properties")
      ) {
        const pipeline = await this.defaultPipelineProperties(portalId, schema);
        if (!pipeline) throw cause;
        await this.createRecord(portalId, schema, {
          ...properties,
          ...pipeline,
        });
        return;
      }
      if (
        !(cause instanceof HubSpotConfigurationError) ||
        cause.status !== 409
      ) {
        throw cause;
      }
      const raced = await this.findByKey(portalId, schema, key);
      if (!raced) throw cause;
      await this.update(portalId, schema, raced.id, properties);
    }
  }

  private async createRecord(
    portalId: number,
    schema: ConfigurationSchema,
    properties: Record<string, string>,
  ): Promise<void> {
    await this.request(
      portalId,
      `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}`,
      { method: "POST", body: JSON.stringify({ properties }) },
    );
  }

  private async defaultPipelineProperties(
    portalId: number,
    schema: ConfigurationSchema,
  ): Promise<Record<string, string> | null> {
    const response = await this.request<{
      results?: Array<{
        id?: string;
        stages?: Array<{ id?: string; displayOrder?: number }>;
      }>;
    }>(
      portalId,
      `/crm/v3/pipelines/${encodeURIComponent(schema.fullyQualifiedName)}`,
    );
    const pipeline = response.results?.[0];
    const stage = pipeline?.stages
      ?.slice()
      .sort(
        (left, right) =>
          (left.displayOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.displayOrder ?? Number.MAX_SAFE_INTEGER),
      )[0];
    if (!pipeline?.id || !stage?.id) return null;
    return { hs_pipeline: pipeline.id, hs_pipeline_stage: stage.id };
  }

  async delete(portalId: number, key: string): Promise<void> {
    assertKey(key);
    const schema = await this.provision(portalId);
    const record = await this.findByKey(portalId, schema, key);
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
    return this.findByKey(portalId, await this.provision(portalId), key);
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

  private async findByKey(
    portalId: number,
    schema: ConfigurationSchema,
    key: string,
  ): Promise<ConfigurationRecord | null> {
    const query = new URLSearchParams({
      idProperty: schema.keyProperty,
      properties: `${schema.keyProperty},encrypted_value`,
    });
    try {
      return await this.request<ConfigurationRecord>(
        portalId,
        `/crm/v3/objects/${encodeURIComponent(schema.fullyQualifiedName)}/${encodeURIComponent(key)}?${query}`,
      );
    } catch (cause) {
      if (cause instanceof HubSpotConfigurationError && cause.status === 404) {
        return null;
      }
      throw cause;
    }
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
          `One-object storage requires crm.schemas.custom.read, crm.objects.custom.read, and crm.objects.custom.write. HubSpot reported: ${cause.message}`,
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
    const fullyQualifiedName = `p${portalId}_${this.#objectName}`;
    try {
      const schema = await this.request<Record<string, unknown>>(
        portalId,
        `/crm-object-schemas/v3/schemas/${encodeURIComponent(fullyQualifiedName)}`,
      );
      return normalizeSchema(schema);
    } catch (cause) {
      if (
        cause instanceof HubSpotConfigurationError &&
        (cause.status === 404 ||
          (cause.status === 400 &&
            cause.message
              .toLowerCase()
              .includes("unable to infer object type")))
      ) {
        return null;
      }
      throw cause;
    }
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
        if (!response.ok) {
          throw new HubSpotConfigurationError(
            response.status,
            text.trim() || `HubSpot API failed with status ${response.status}.`,
          );
        }
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
      const details =
        typeof body === "object" && body !== null
          ? JSON.stringify({
              ...((body as Record<string, unknown>).context === undefined
                ? {}
                : { context: (body as Record<string, unknown>).context }),
              ...((body as Record<string, unknown>).errors === undefined
                ? {}
                : { errors: (body as Record<string, unknown>).errors }),
            })
          : "{}";
      throw new HubSpotConfigurationError(
        response.status,
        details === "{}" ? message : `${message} ${details}`,
      );
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
  const keyProperty =
    typeof value.primaryDisplayProperty === "string" &&
    value.primaryDisplayProperty.trim()
      ? value.primaryDisplayProperty
      : "config_key";
  return { fullyQualifiedName: value.fullyQualifiedName, keyProperty };
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
