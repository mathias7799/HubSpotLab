import type { RuntimeConfig } from "./config.js";
import { seal, unseal } from "./crypto.js";

export interface Installation {
  portalId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  installedAt: number;
}

export interface TokenStore {
  get(portalId: number): Promise<Installation | null>;
  put(installation: Installation): Promise<void>;
  delete(portalId: number): Promise<void>;
}

export class MemoryTokenStore implements TokenStore {
  readonly #values = new Map<number, Installation>();

  async get(portalId: number): Promise<Installation | null> {
    const installation = this.#values.get(portalId);
    return installation ? { ...installation } : null;
  }

  async put(installation: Installation): Promise<void> {
    assertInstallation(installation);
    this.#values.set(installation.portalId, { ...installation });
  }

  async delete(portalId: number): Promise<void> {
    this.#values.delete(portalId);
  }
}

export class UpstashTokenStore implements TokenStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly encryptionKey: string,
    private readonly namespace: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async get(portalId: number): Promise<Installation | null> {
    const response = await this.command(["GET", this.key(portalId)]);
    if (response.result === null || response.result === undefined) return null;
    if (typeof response.result !== "string") {
      throw new Error("Token store returned an invalid installation.");
    }
    const installation = JSON.parse(
      unseal(response.result, this.encryptionKey, this.context),
    ) as Installation;
    assertInstallation(installation);
    return installation;
  }

  async put(installation: Installation): Promise<void> {
    assertInstallation(installation);
    await this.command([
      "SET",
      this.key(installation.portalId),
      seal(JSON.stringify(installation), this.encryptionKey, this.context),
    ]);
  }

  async delete(portalId: number): Promise<void> {
    await this.command(["DEL", this.key(portalId)]);
  }

  private get context(): string {
    return `${this.namespace}:token-store`;
  }

  private key(portalId: number): string {
    return `spotkit:${this.namespace}:installation:${portalId}`;
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
        body.error ?? `Token store failed with status ${response.status}.`,
      );
    }
    return body;
  }
}

export function createTokenStore(
  config: RuntimeConfig,
  fetcher: typeof fetch = fetch,
): TokenStore {
  if (config.upstashUrl && config.upstashToken) {
    return new UpstashTokenStore(
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
    return new MemoryTokenStore();
  }
  throw new Error(
    "Durable encrypted token storage is required outside local development.",
  );
}

function assertInstallation(value: Installation): void {
  if (
    !Number.isInteger(value.portalId) ||
    value.portalId <= 0 ||
    !value.accessToken ||
    !value.refreshToken ||
    !Number.isFinite(value.expiresAt) ||
    !Number.isFinite(value.installedAt)
  ) {
    throw new Error("Token store installation is malformed.");
  }
}
