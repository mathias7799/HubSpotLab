import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { OAuthError, OAuthService } from "./oauth.js";
import { assertHubSpotRequest } from "./security.js";
import type { TokenStore } from "./token-store.js";

export function createService(
  config: AppConfig,
  store: TokenStore,
  fetcher: typeof fetch = fetch,
) {
  const oauth = new OAuthService(config, store, fetcher);
  const api = createApp({
    accessTokenForPortal: (portalId) => oauth.accessToken(portalId),
    verifyRequest: (request, rawBody) =>
      assertHubSpotRequest(request, config, rawBody),
    fetcher,
  });
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/oauth/install") {
        const location = oauth.installUrl(
          url.searchParams.get("returnTo") ?? undefined,
        );
        const state = new URL(location).searchParams.get("state");
        const secure = config.publicUrl.startsWith("https://")
          ? "; Secure"
          : "";
        return new Response(null, {
          status: 302,
          headers: {
            Location: location,
            "Set-Cookie": `closeready_oauth_state=${state}; HttpOnly${secure}; SameSite=Lax; Path=/oauth; Max-Age=600`,
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/oauth/callback") {
        const code = requiredQuery(url, "code");
        const state = requiredQuery(url, "state");
        if (cookie(request, "closeready_oauth_state") !== state) {
          throw new OAuthError(400, "OAuth state cookie does not match.");
        }
        const installation = await oauth.complete(code, state);
        return Response.redirect(
          new URL(installation.returnTo, config.publicUrl),
          302,
        );
      }
      if (request.method === "GET" && url.pathname === "/installed") {
        return new Response(
          "<!doctype html><meta charset=utf-8><title>CloseReady</title><h1>CloseReady is installed</h1><p>Return to HubSpot to configure transition requirements.</p>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      return api(request);
    } catch (cause) {
      if (cause instanceof OAuthError)
        return Response.json(
          { error: cause.message },
          { status: cause.status },
        );
      return Response.json(
        {
          error:
            cause instanceof Error ? cause.message : "Internal server error",
        },
        { status: 500 },
      );
    }
  };
}

function requiredQuery(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value) throw new OAuthError(400, `Missing query parameter ${name}.`);
  return value;
}

function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}
