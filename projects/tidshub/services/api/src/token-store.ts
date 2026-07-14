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
  readonly #installations = new Map<number, Installation>();

  async get(portalId: number): Promise<Installation | null> {
    return this.#installations.get(portalId) ?? null;
  }

  async put(installation: Installation): Promise<void> {
    this.#installations.set(installation.portalId, installation);
  }

  async delete(portalId: number): Promise<void> {
    this.#installations.delete(portalId);
  }
}

interface UpstashResponse {
  result?: unknown;
  error?: string;
}

export class UpstashTokenStore implements TokenStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly encryptionKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async get(portalId: number): Promise<Installation | null> {
    const response = await this.command(["GET", key(portalId)]);
    if (response.result === null || response.result === undefined) return null;
    if (typeof response.result !== "string") {
      throw new Error("Token store returned an invalid installation.");
    }
    return JSON.parse(
      unseal(response.result, this.encryptionKey),
    ) as Installation;
  }

  async put(installation: Installation): Promise<void> {
    await this.command([
      "SET",
      key(installation.portalId),
      seal(JSON.stringify(installation), this.encryptionKey),
    ]);
  }

  async delete(portalId: number): Promise<void> {
    await this.command(["DEL", key(portalId)]);
  }

  private async command(command: string[]): Promise<UpstashResponse> {
    const response = await this.fetcher(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const body = (await response.json()) as UpstashResponse;
    if (!response.ok || body.error) {
      throw new Error(
        body.error ?? `Token store failed with ${response.status}.`,
      );
    }
    return body;
  }
}

function key(portalId: number): string {
  return `tidshub:installation:${portalId}`;
}
