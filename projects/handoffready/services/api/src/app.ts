import {
  createSpotKitRuntime,
  HttpError,
  HubSpotObjectConfigurationStore,
} from "@hubspotlab/spotkit-runtime";
import { handleHubSpotWebhooks } from "./features/webhooks.js";
import { handleHandoffWorkflowAction } from "./features/workflow-action.js";
import {
  loadAuthorizationPolicy,
  permissionsForRequest,
  requireSettingsAdministrator,
  requireTicketCreator,
} from "./authorization.js";
import {
  createHandoffTicket,
  createConfiguredHandoff,
  evaluateHandoff,
  evaluateConfiguredHandoff,
  getHandoffSettings,
  HandoffService,
  listHandoffs,
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
      "crm.objects.contacts.write",
      "crm.objects.projects.read",
      "crm.objects.projects.write",
      "crm.schemas.custom.read",
      "crm.objects.custom.read",
      "crm.objects.custom.write",
      "settings.users.read",
      "tickets",
    ],
    env,
    fetcher,
    createApi: (context) => {
      const { accessTokenForPortal, verifyRequest } = context;
      const configuration =
        env.HANDOFFREADY_CONFIGURATION_STORAGE === "hubspot-object"
          ? new HubSpotObjectConfigurationStore({
              appName: "HandoffReady",
              namespace: "handoffready",
              encryptionKey: env.TOKEN_ENCRYPTION_KEY as string,
              accessTokenForPortal,
              fetcher,
            })
          : context.configuration;
      const handoffContext = { ...context, configuration };
      return async (request) => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
          return Response.json({ ok: true, service: "handoffready-api" });
        }
        if (request.method === "GET" && url.pathname === "/api/installation") {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          const token = await accessTokenForPortal(portalId);
          if (url.searchParams.get("includeScopes") === "true") {
            const response = await fetcher(
              `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(token)}`,
            );
            const body = (await response.json()) as Record<string, unknown>;
            if (!response.ok) {
              throw new HttpError(
                502,
                typeof body.message === "string"
                  ? body.message
                  : "HubSpot could not inspect the installation token.",
              );
            }
            return Response.json({
              installed: true,
              portalId,
              scopes: Array.isArray(body.scopes)
                ? body.scopes.filter(
                    (scope): scope is string => typeof scope === "string",
                  )
                : [],
            });
          }
          return Response.json({ installed: true, portalId });
        }
        if (url.pathname === "/api/settings") {
          const rawBody = request.method === "GET" ? "" : await request.text();
          await verifyRequest(request, rawBody);
          const portalId = readPortalId(url);
          const token = await accessTokenForPortal(portalId);
          const permissions = await resolvePermissions(
            request,
            portalId,
            token,
          );
          if (request.method === "GET") {
            return Response.json(
              await getHandoffSettings(handoffContext, portalId),
            );
          }
          if (request.method === "PUT") {
            requireJsonRequest(request);
            requireSettingsAdministrator(permissions);
            const settings = parseSettingsBody(rawBody);
            await new HandoffService(token, fetcher).validateSettings(settings);
            await configuration.put(
              portalId,
              "handoff.settings",
              JSON.parse(JSON.stringify(settings)) as never,
            );
            return Response.json(settings);
          }
        }
        if (request.method === "GET" && url.pathname === "/api/authorization") {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          await accessTokenForPortal(portalId);
          return Response.json(
            await resolvePermissions(
              request,
              portalId,
              await accessTokenForPortal(portalId),
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
          const settings = await getHandoffSettings(handoffContext, portalId);
          const dealId = decodeURIComponent(dealRoute[1] as string);
          const routeId = url.searchParams.get("routeId")?.trim();
          if (request.method === "POST") {
            requireTicketCreator(
              await resolvePermissions(
                request,
                portalId,
                await accessTokenForPortal(portalId),
              ),
            );
          }
          return Response.json(
            routeId
              ? request.method === "POST"
                ? await createConfiguredHandoff(
                    handoffContext,
                    portalId,
                    dealId,
                    settings,
                    routeId,
                  )
                : await evaluateConfiguredHandoff(
                    handoffContext,
                    portalId,
                    dealId,
                    settings,
                    routeId,
                  )
              : request.method === "POST"
                ? await createHandoffTicket(
                    handoffContext,
                    portalId,
                    dealId,
                    settings,
                  )
                : await evaluateHandoff(
                    handoffContext,
                    portalId,
                    dealId,
                    settings,
                  ),
          );
        }
        if (request.method === "GET" && url.pathname === "/api/handoffs") {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          return Response.json({
            results: await listHandoffs(
              handoffContext,
              portalId,
              await getHandoffSettings(handoffContext, portalId),
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
        if (
          request.method === "GET" &&
          url.pathname === "/api/project-pipelines"
        ) {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          const token = await accessTokenForPortal(portalId);
          return Response.json({
            results: await new HandoffService(
              token,
              fetcher,
            ).projectPipelines(),
          });
        }
        if (
          request.method === "GET" &&
          url.pathname === "/api/deal-properties"
        ) {
          await verifyRequest(request, "");
          const portalId = readPortalId(url);
          const token = await accessTokenForPortal(portalId);
          return Response.json({
            results: await new HandoffService(token, fetcher).dealProperties(),
          });
        }
        const webhookResponse = await handleHubSpotWebhooks(
          request,
          handoffContext,
        );
        if (webhookResponse) return webhookResponse;
        const workflowActionResponse = await handleHandoffWorkflowAction(
          request,
          handoffContext,
        );
        if (workflowActionResponse) return workflowActionResponse;
        // spotkit:feature-routes
        return Response.json({ error: "Not found" }, { status: 404 });
      };

      async function resolvePermissions(
        request: Request,
        portalId: number,
        token: string,
      ) {
        const base = permissionsForRequest(
          request,
          portalId,
          authorizationPolicy,
          allowUnsignedDevelopmentRequests,
        );
        if (base.canManageSettings || base.userId === "local-developer")
          return base;
        try {
          const isSuperAdmin = await new HandoffService(
            token,
            fetcher,
          ).isSuperAdmin(base.userId);
          return permissionsForRequest(
            request,
            portalId,
            authorizationPolicy,
            allowUnsignedDevelopmentRequests,
            isSuperAdmin,
          );
        } catch (cause) {
          console.warn(
            "HandoffReady could not verify HubSpot Super Admin status",
            { portalId, userId: base.userId, cause },
          );
          return base;
        }
      }
    },
  }).app;
}

function requireJsonRequest(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
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
