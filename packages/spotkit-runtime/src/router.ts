import type { RuntimeConfig } from "./config.js";
import { OAuthError, OAuthService } from "./oauth.js";

export function createOAuthRouter(
  config: RuntimeConfig,
  oauth: OAuthService,
  api: (request: Request) => Promise<Response>,
) {
  const cookieName = `spotkit_${config.namespace.replaceAll("-", "_")}_oauth_state`;
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/oauth/install") {
        const location = oauth.installUrl(
          url.searchParams.get("returnTo") ?? undefined,
        );
        const state = new URL(location).searchParams.get("state") ?? "";
        const secure = config.publicUrl.startsWith("https://")
          ? "; Secure"
          : "";
        return new Response(null, {
          status: 302,
          headers: {
            Location: location,
            "Cache-Control": "no-store",
            "Set-Cookie": `${cookieName}=${state}; HttpOnly${secure}; SameSite=Lax; Path=/oauth; Max-Age=600`,
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/oauth/callback") {
        const code = requiredQuery(url, "code");
        const state = requiredQuery(url, "state");
        if (!oauth.stateMatchesCookie(state, cookie(request, cookieName))) {
          throw new OAuthError(400, "OAuth state cookie does not match.");
        }
        const installation = await oauth.complete(code, state);
        const secure = config.publicUrl.startsWith("https://")
          ? "; Secure"
          : "";
        return new Response(null, {
          status: 302,
          headers: {
            Location: new URL(installation.returnTo, config.publicUrl).href,
            "Cache-Control": "no-store",
            "Set-Cookie": `${cookieName}=; HttpOnly${secure}; SameSite=Lax; Path=/oauth; Max-Age=0`,
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/installed") {
        return installedPage(config.appName);
      }
      return await api(request);
    } catch (cause) {
      if (cause instanceof OAuthError || cause instanceof HttpError) {
        return Response.json(
          { error: cause.message },
          { status: cause.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      console.error(cause);
      return Response.json(
        { error: "Internal server error" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function installedPage(appName: string): Response {
  const safeName = escapeHtml(appName);
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeName}</title></head><body><main><h1>${safeName} is connected</h1><p>Return to HubSpot to continue setup.</p></main></body></html>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
