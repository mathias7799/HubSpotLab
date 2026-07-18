import { createHash } from "node:crypto";

import type { RuntimeConfig } from "./config.js";

export interface IdempotencyStore {
  claim(key: string, ttlSeconds?: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #claims = new Map<string, number>();

  async claim(key: string, ttlSeconds = 86_400): Promise<boolean> {
    validateTtl(ttlSeconds);
    const hashed = hashKey(key);
    const now = Date.now();
    const expiresAt = this.#claims.get(hashed);
    if (expiresAt !== undefined && expiresAt > now) return false;
    this.#claims.set(hashed, now + ttlSeconds * 1000);
    return true;
  }

  async release(key: string): Promise<void> {
    this.#claims.delete(hashKey(key));
  }
}

export class UpstashIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly namespace: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async claim(key: string, ttlSeconds = 86_400): Promise<boolean> {
    validateTtl(ttlSeconds);
    const response = await this.command([
      "SET",
      this.key(key),
      "1",
      "NX",
      "EX",
      String(ttlSeconds),
    ]);
    return response.result === "OK";
  }

  async release(key: string): Promise<void> {
    await this.command(["DEL", this.key(key)]);
  }

  private key(value: string): string {
    return `spotkit:${this.namespace}:idempotency:${hashKey(value)}`;
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
          `Idempotency store failed with status ${response.status}.`,
      );
    }
    return body;
  }
}

export function createIdempotencyStore(
  config: RuntimeConfig,
  fetcher: typeof fetch = fetch,
): IdempotencyStore {
  if (config.upstashUrl && config.upstashToken) {
    return new UpstashIdempotencyStore(
      config.upstashUrl,
      config.upstashToken,
      config.namespace,
      fetcher,
    );
  }
  if (
    config.allowUnsignedDevelopmentRequests ||
    config.allowEphemeralTunnelDevelopment
  ) {
    return new MemoryIdempotencyStore();
  }
  throw new Error("Durable idempotency storage is required in production.");
}

function hashKey(value: string): string {
  if (!value || Buffer.byteLength(value, "utf8") > 1024) {
    throw new Error("Idempotency key must contain between 1 and 1024 bytes.");
  }
  return createHash("sha256").update(value).digest("hex");
}

function validateTtl(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 2_592_000) {
    throw new Error("Idempotency TTL must be between 1 and 2592000 seconds.");
  }
}
