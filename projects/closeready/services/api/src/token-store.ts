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
    return this.#values.get(portalId) ?? null;
  }
  async put(installation: Installation): Promise<void> {
    this.#values.set(installation.portalId, installation);
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
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async get(portalId: number): Promise<Installation | null> {
    const body = await this.command(["GET", key(portalId)]);
    if (body.result === null || body.result === undefined) return null;
    if (typeof body.result !== "string")
      throw new Error("Invalid token-store value.");
    return JSON.parse(unseal(body.result, this.encryptionKey)) as Installation;
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
    if (!response.ok || body.error)
      throw new Error(body.error ?? "Token store failed.");
    return body;
  }
}

function key(portalId: number): string {
  return `closeready:installation:${portalId}`;
}
