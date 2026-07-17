import { randomBytes } from "node:crypto";

import type { RuntimeConfig } from "./config.js";
import { safeEqual, sign, verifySignature } from "./crypto.js";
import type { Installation, TokenStore } from "./token-store.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface OAuthState {
  nonce: string;
  issuedAt: number;
  returnTo: string;
}

export class OAuthService {
  readonly #refreshes = new Map<number, Promise<string>>();

  constructor(
    private readonly config: RuntimeConfig,
    private readonly store: TokenStore,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  installUrl(returnTo = "/installed"): string {
    const url = new URL("https://app.hubspot.com/oauth/authorize");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl);
    url.searchParams.set("scope", this.config.requiredScopes.join(" "));
    if (this.config.optionalScopes.length) {
      url.searchParams.set(
        "optional_scope",
        this.config.optionalScopes.join(" "),
      );
    }
    url.searchParams.set("state", this.createState(returnTo));
    return url.toString();
  }

  async complete(
    code: string,
    state: string,
  ): Promise<OAuthState & Installation> {
    const payload = this.readState(state);
    const tokens = await this.requestTokens({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.callbackUrl,
      code,
    });
    const portalId = await this.portalIdFor(tokens.access_token);
    const now = Date.now();
    const installation: Installation = {
      portalId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: now + tokens.expires_in * 1000,
      installedAt: now,
    };
    await this.store.put(installation);
    return { ...payload, ...installation };
  }

  async accessToken(portalId: number): Promise<string> {
    const installation = await this.store.get(portalId);
    if (!installation) {
      throw new OAuthError(
        401,
        `${this.config.appName} is not installed in this portal.`,
      );
    }
    if (installation.expiresAt > Date.now() + 60_000) {
      return installation.accessToken;
    }
    const active = this.#refreshes.get(portalId);
    if (active) return active;
    const refresh = this.refresh(installation).finally(() => {
      this.#refreshes.delete(portalId);
    });
    this.#refreshes.set(portalId, refresh);
    return refresh;
  }

  stateMatchesCookie(state: string, cookieValue: string | null): boolean {
    return cookieValue !== null && safeEqual(state, cookieValue);
  }

  private async refresh(installation: Installation): Promise<string> {
    const tokens = await this.requestTokens({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: installation.refreshToken,
    });
    await this.store.put({
      ...installation,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    return tokens.access_token;
  }

  private get callbackUrl(): string {
    return `${this.config.publicUrl}/oauth/callback`;
  }

  private createState(returnTo: string): string {
    const safeReturnTo = safeRelativePath(returnTo);
    const encoded = Buffer.from(
      JSON.stringify({
        nonce: randomBytes(16).toString("base64url"),
        issuedAt: Date.now(),
        returnTo: safeReturnTo,
      } satisfies OAuthState),
    ).toString("base64url");
    return `${encoded}.${sign(encoded, this.config.clientSecret)}`;
  }

  private readState(state: string): OAuthState {
    const [encoded, signature] = state.split(".");
    if (
      !encoded ||
      !signature ||
      !verifySignature(encoded, signature, this.config.clientSecret)
    ) {
      throw new OAuthError(400, "Invalid OAuth state.");
    }
    let payload: OAuthState;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as OAuthState;
    } catch {
      throw new OAuthError(400, "Invalid OAuth state.");
    }
    if (
      !payload.nonce ||
      !Number.isFinite(payload.issuedAt) ||
      typeof payload.returnTo !== "string" ||
      Date.now() - payload.issuedAt > 600_000 ||
      payload.issuedAt > Date.now() + 60_000
    ) {
      throw new OAuthError(400, "OAuth state has expired.");
    }
    return { ...payload, returnTo: safeRelativePath(payload.returnTo) };
  }

  private async requestTokens(
    values: Record<string, string>,
  ): Promise<TokenResponse> {
    const response = await this.fetcher(
      "https://api.hubapi.com/oauth/v1/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(values),
      },
    );
    const body = await jsonBody(response);
    if (
      !response.ok ||
      typeof body.access_token !== "string" ||
      typeof body.refresh_token !== "string" ||
      typeof body.expires_in !== "number" ||
      !Number.isFinite(body.expires_in) ||
      body.expires_in <= 0
    ) {
      throw new OAuthError(
        502,
        typeof body.message === "string"
          ? body.message
          : `HubSpot token exchange failed with status ${response.status}.`,
      );
    }
    return body as unknown as TokenResponse;
  }

  private async portalIdFor(accessToken: string): Promise<number> {
    const response = await this.fetcher(
      `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`,
    );
    const body = await jsonBody(response);
    if (!response.ok || !Number.isInteger(body.hub_id)) {
      throw new OAuthError(
        502,
        typeof body.message === "string"
          ? body.message
          : "HubSpot did not return the installed portal ID.",
      );
    }
    return body.hub_id as number;
  }
}

export class OAuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function safeRelativePath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/installed";
  }
  return value;
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value = (await response.json()) as unknown;
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
