import { randomBytes } from "node:crypto";

import { defaultScopes, type AppConfig } from "./config.js";
import { sign, verifySignature } from "./crypto.js";
import type { Installation, TokenStore } from "./token-store.js";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface StatePayload {
  nonce: string;
  issuedAt: number;
  returnTo: string;
}

export class OAuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly store: TokenStore,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  installUrl(returnTo = "/installed"): string {
    const url = new URL("https://app.hubspot.com/oauth/authorize");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.callbackUrl);
    const required = this.config.scopes.filter((scope) =>
      defaultScopes.includes(scope as (typeof defaultScopes)[number]),
    );
    const optional = this.config.scopes.filter(
      (scope) => !required.includes(scope),
    );
    url.searchParams.set("scope", required.join(" "));
    if (optional.length) {
      url.searchParams.set("optional_scope", optional.join(" "));
    }
    url.searchParams.set("state", this.createState(returnTo));
    return url.toString();
  }

  async complete(
    code: string,
    state: string,
  ): Promise<StatePayload & Installation> {
    const payload = this.readState(state);
    const tokens = await this.tokens({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.callbackUrl,
      code,
    });
    const info = await this.fetcher(
      `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(tokens.access_token)}`,
    );
    const infoBody = (await info.json()) as {
      hub_id?: number;
      message?: string;
    };
    if (!info.ok || !Number.isInteger(infoBody.hub_id)) {
      throw new OAuthError(
        502,
        infoBody.message ?? "HubSpot did not return a portal ID.",
      );
    }
    const now = Date.now();
    const installation: Installation = {
      portalId: infoBody.hub_id as number,
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
    if (!installation)
      throw new OAuthError(401, "CloseReady is not installed in this portal.");
    if (installation.expiresAt > Date.now() + 60_000)
      return installation.accessToken;
    const tokens = await this.tokens({
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
    const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/installed";
    const encoded = Buffer.from(
      JSON.stringify({
        nonce: randomBytes(16).toString("base64url"),
        issuedAt: Date.now(),
        returnTo: safeReturnTo,
      } satisfies StatePayload),
    ).toString("base64url");
    return `${encoded}.${sign(encoded, this.config.clientSecret)}`;
  }

  private readState(state: string): StatePayload {
    const [encoded, signature] = state.split(".");
    if (
      !encoded ||
      !signature ||
      !verifySignature(encoded, signature, this.config.clientSecret)
    ) {
      throw new OAuthError(400, "Invalid OAuth state.");
    }
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as StatePayload;
    if (Date.now() - payload.issuedAt > 600_000)
      throw new OAuthError(400, "OAuth state expired.");
    return payload;
  }

  private async tokens(values: Record<string, string>): Promise<TokenResponse> {
    const response = await this.fetcher(
      "https://api.hubapi.com/oauth/v1/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(values),
      },
    );
    const body = (await response.json()) as Partial<TokenResponse> & {
      message?: string;
    };
    if (
      !response.ok ||
      typeof body.access_token !== "string" ||
      typeof body.refresh_token !== "string" ||
      typeof body.expires_in !== "number"
    ) {
      throw new OAuthError(
        502,
        body.message ?? "HubSpot token exchange failed.",
      );
    }
    return body as TokenResponse;
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
