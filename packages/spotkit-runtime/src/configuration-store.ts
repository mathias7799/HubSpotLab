import type { RuntimeConfig } from "./config.js";
import { seal, unseal } from "./crypto.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ConfigurationStore {
  get<Value extends JsonValue = JsonValue>(
    portalId: number,
    key: string,
  ): Promise<Value | null>;
  put(portalId: number, key: string, value: JsonValue): Promise<void>;
  delete(portalId: number, key: string): Promise<void>;
}

export class MemoryConfigurationStore implements ConfigurationStore {
  readonly #values = new Map<string, string>();

  async get<Value extends JsonValue = JsonValue>(
    portalId: number,
    key: string,
  ): Promise<Value | null> {
    const storageKey = validatedStorageKey(portalId, key);
    const value = this.#values.get(storageKey);
    return value === undefined
      ? null
      : (parseConfigurationValue(value) as Value);
  }

  async put(portalId: number, key: string, value: JsonValue): Promise<void> {
    this.#values.set(
      validatedStorageKey(portalId, key),
      serializeConfigurationValue(value),
    );
  }

  async delete(portalId: number, key: string): Promise<void> {
    this.#values.delete(validatedStorageKey(portalId, key));
  }
}

export class UpstashConfigurationStore implements ConfigurationStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly encryptionKey: string,
    private readonly namespace: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async get<Value extends JsonValue = JsonValue>(
    portalId: number,
    key: string,
  ): Promise<Value | null> {
    const storageKey = validatedStorageKey(portalId, key);
    const response = await this.command(["GET", this.key(storageKey)]);
    if (response.result === null || response.result === undefined) return null;
    if (typeof response.result !== "string") {
      throw new Error("Configuration store returned an invalid value.");
    }
    return parseConfigurationValue(
      unseal(response.result, this.encryptionKey, this.context(storageKey)),
    ) as Value;
  }

  async put(portalId: number, key: string, value: JsonValue): Promise<void> {
    const storageKey = validatedStorageKey(portalId, key);
    await this.command([
      "SET",
      this.key(storageKey),
      seal(
        serializeConfigurationValue(value),
        this.encryptionKey,
        this.context(storageKey),
      ),
    ]);
  }

  async delete(portalId: number, key: string): Promise<void> {
    const storageKey = validatedStorageKey(portalId, key);
    await this.command(["DEL", this.key(storageKey)]);
  }

  private key(storageKey: string): string {
    return `spotkit:${this.namespace}:configuration:${storageKey}`;
  }

  private context(storageKey: string): string {
    return `${this.namespace}:configuration:${storageKey}`;
  }

  private async command(
    command: string[],
  ): Promise<{ result?: unknown; error?: string }> {
    const response = await this.fetcher(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const body = (await response.json()) as {
      result?: unknown;
      error?: string;
    };
    if (!response.ok || body.error) {
      throw new Error(
        body.error ??
          `Configuration store failed with status ${response.status}.`,
      );
    }
    return body;
  }
}

export function createConfigurationStore(
  config: RuntimeConfig,
  fetcher: typeof fetch = fetch,
): ConfigurationStore {
  if (config.upstashUrl && config.upstashToken) {
    return new UpstashConfigurationStore(
      config.upstashUrl,
      config.upstashToken,
      config.encryptionKey,
      config.namespace,
      fetcher,
    );
  }
  if (
    config.allowUnsignedDevelopmentRequests ||
    config.allowEphemeralTunnelDevelopment
  ) {
    return new MemoryConfigurationStore();
  }
  throw new Error(
    "Durable encrypted configuration storage is required outside local development.",
  );
}

function validatedStorageKey(portalId: number, key: string): string {
  if (!Number.isInteger(portalId) || portalId <= 0) {
    throw new Error("Configuration portalId must be a positive integer.");
  }
  if (!/^[a-z][a-z0-9._-]{0,127}$/.test(key)) {
    throw new Error(
      "Configuration key must start with a lowercase letter and use only lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  return `${portalId}:${key}`;
}

export function serializeConfigurationValue(value: JsonValue): string {
  if (!isJsonValue(value)) {
    throw new Error("Configuration value must be valid JSON.");
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Configuration value must be valid JSON.");
  }
  if (Buffer.byteLength(serialized, "utf8") > 65_536) {
    throw new Error("Configuration value must not exceed 64 KiB.");
  }
  parseConfigurationValue(serialized);
  return serialized;
}

export function parseConfigurationValue(value: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Configuration store value is malformed.");
  }
  if (!isJsonValue(parsed)) {
    throw new Error("Configuration store value is not valid JSON.");
  }
  return parsed;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isJsonValue);
}
