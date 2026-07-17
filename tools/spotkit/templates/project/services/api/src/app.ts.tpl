import { createSpotKitRuntime, HttpError } from "@hubspotlab/spotkit-runtime";

export function createApp(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  return createSpotKitRuntime({
    appName: "__SPOTKIT_DISPLAY_NAME_JSON__",
    namespace: "__SPOTKIT_SLUG__",
    requiredScopes: ["oauth", "crm.objects.deals.read"],
    env,
    fetcher,
    createApi:
      ({ accessTokenForPortal, configuration, verifyRequest }) =>
      async (request) => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
          return Response.json({ ok: true, service: "__SPOTKIT_SLUG__-api" });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/api/installation"
        ) {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          await accessTokenForPortal(portalId);
          return Response.json({ installed: true, portalId });
        }
        if (url.pathname === "/api/settings") {
          const rawBody = request.method === "GET" ? "" : await request.text();
          await verifyRequest(request, rawBody);
          const portalId = readPortalId(url);
          await accessTokenForPortal(portalId);
          if (request.method === "GET") {
            const settings = await configuration.get(portalId, "app.settings");
            return Response.json(
              settings ?? { enabled: true, message: "Ready to get started." },
            );
          }
          if (request.method === "PUT") {
            const settings = readSettings(rawBody);
            await configuration.put(portalId, "app.settings", settings);
            return Response.json(settings);
          }
        }
        return Response.json({ error: "Not found" }, { status: 404 });
      },
  }).app;
}

function readPortalId(url: URL): number {
  const portalId = Number(url.searchParams.get("portalId"));
  if (!Number.isInteger(portalId) || portalId <= 0) {
    throw new HttpError(400, "A valid portalId is required.");
  }
  return portalId;
}

function readSettings(rawBody: string): { enabled: boolean; message: string } {
  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError(400, "Settings must be valid JSON.");
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("enabled" in body) ||
    typeof body.enabled !== "boolean" ||
    !("message" in body) ||
    typeof body.message !== "string" ||
    body.message.trim().length === 0 ||
    body.message.length > 200
  ) {
    throw new HttpError(
      400,
      "Settings require an enabled flag and a message between 1 and 200 characters.",
    );
  }
  return { enabled: body.enabled, message: body.message.trim() };
}
