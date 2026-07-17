import { createSpotKitRuntime, HttpError } from "@hubspotlab/spotkit-runtime";
import { handleHubSpotWebhooks } from "./features/webhooks.js";
import { handleHandoffWorkflowAction } from "./features/workflow-action.js";
import {
  loadAuthorizationPolicy,
  permissionsForRequest,
  requireSettingsAdministrator,
  requireTicketCreator,
} from "./authorization.js";
import {
  getHandoffSettings,
  HandoffService,
  parseHandoffSettings,
} from "./handoff.js";
// spotkit:feature-imports

export function createApp(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  const authorizationPolicy = loadAuthorizationPolicy(
    env.HANDOFFREADY_AUTHORIZATION_POLICY,
  );
  const allowUnsignedDevelopmentRequests =
    env.ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS === "true";
  return createSpotKitRuntime({
    appName: "HandoffReady",
    namespace: "handoffready",
    requiredScopes: [
      "oauth",
      "crm.objects.deals.read",
      "crm.objects.tickets.read",
      "crm.objects.tickets.write",
    ],
    env,
    fetcher,
    createApi: (context) => {
      const { accessTokenForPortal, configuration, verifyRequest } = context;
      return async (request) => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
          return Response.json({ ok: true, service: "handoffready-api" });
        }
        if (request.method === "GET" && url.pathname === "/api/installation") {
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
          const permissions = permissionsForRequest(
            request,
            portalId,
            authorizationPolicy,
            allowUnsignedDevelopmentRequests,
          );
          if (request.method === "GET") {
            return Response.json(await getHandoffSettings(context, portalId));
          }
          if (request.method === "PUT") {
            requireSettingsAdministrator(permissions);
            const settings = parseSettingsBody(rawBody);
            await configuration.put(portalId, "handoff.settings", {
              ...settings,
            });
            return Response.json(settings);
          }
        }
        if (request.method === "GET" && url.pathname === "/api/authorization") {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          await accessTokenForPortal(portalId);
          return Response.json(
            permissionsForRequest(
              request,
              portalId,
              authorizationPolicy,
              allowUnsignedDevelopmentRequests,
            ),
          );
        }
        const dealRoute = url.pathname.match(
          /^\/api\/deals\/([^/]+)\/handoff$/,
        );
        if (dealRoute && ["GET", "POST"].includes(request.method)) {
          const rawBody = request.method === "GET" ? "" : await request.text();
          await verifyRequest(request, rawBody);
          const portalId = readPortalId(url);
          const token = await accessTokenForPortal(portalId);
          const service = new HandoffService(token, fetcher);
          const settings = await getHandoffSettings(context, portalId);
          const dealId = decodeURIComponent(dealRoute[1] as string);
          if (request.method === "POST") {
            requireTicketCreator(
              permissionsForRequest(
                request,
                portalId,
                authorizationPolicy,
                allowUnsignedDevelopmentRequests,
              ),
            );
          }
          return Response.json(
            request.method === "POST"
              ? await service.createTicket(dealId, settings)
              : await service.evaluate(dealId, settings),
          );
        }
        if (request.method === "GET" && url.pathname === "/api/handoffs") {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          const token = await accessTokenForPortal(portalId);
          const service = new HandoffService(token, fetcher);
          return Response.json({
            results: await service.list(
              await getHandoffSettings(context, portalId),
            ),
          });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/api/ticket-pipelines"
        ) {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          const token = await accessTokenForPortal(portalId);
          return Response.json({
            results: await new HandoffService(token, fetcher).ticketPipelines(),
          });
        }
        const webhookResponse = await handleHubSpotWebhooks(request, context);
        if (webhookResponse) return webhookResponse;
        const workflowActionResponse = await handleHandoffWorkflowAction(
          request,
          context,
        );
        if (workflowActionResponse) return workflowActionResponse;
        // spotkit:feature-routes
        return Response.json({ error: "Not found" }, { status: 404 });
      };
    },
  }).app;
}

function parseSettingsBody(rawBody: string) {
  try {
    return parseHandoffSettings(JSON.parse(rawBody) as unknown);
  } catch (cause) {
    if (cause instanceof HttpError) throw cause;
    throw new HttpError(400, "Settings must be valid JSON.");
  }
}

function readPortalId(url: URL): number {
  const portalId = Number(url.searchParams.get("portalId"));
  if (!Number.isInteger(portalId) || portalId <= 0) {
    throw new HttpError(400, "A valid portalId is required.");
  }
  return portalId;
}
