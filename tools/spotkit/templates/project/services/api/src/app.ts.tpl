import { createSpotKitRuntime } from "@hubspotlab/spotkit-runtime";

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
    createApi: () => async (request) => {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true, service: "__SPOTKIT_SLUG__-api" });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  }).app;
}
