import { HttpError } from "@hubspotlab/spotkit-runtime";

export interface HandoffPermissions {
  userId: string;
  userEmail: string;
  canManageSettings: boolean;
  canCreateTicket: boolean;
  isSuperAdmin: boolean;
}

type AuthorizationPolicy = Record<
  string,
  { administrators: string[]; ticketCreators: string[] }
>;

export function loadAuthorizationPolicy(
  value: string | undefined,
): AuthorizationPolicy {
  if (!value?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("HANDOFFREADY_AUTHORIZATION_POLICY must be valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("HANDOFFREADY_AUTHORIZATION_POLICY must be a portal map.");
  }
  const policy: AuthorizationPolicy = {};
  for (const [portalId, entry] of Object.entries(parsed)) {
    if (!/^\d+$/.test(portalId) || Number(portalId) <= 0) {
      throw new Error(
        "HandoffReady policy portal IDs must be positive integers.",
      );
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(
        `HandoffReady policy for portal ${portalId} must be an object.`,
      );
    }
    const record = entry as Record<string, unknown>;
    policy[portalId] = {
      administrators: userIds(record.administrators, "administrators"),
      ticketCreators: userIds(record.ticketCreators, "ticketCreators"),
    };
  }
  return policy;
}

export function permissionsForRequest(
  request: Request,
  portalId: number,
  policy: AuthorizationPolicy,
  allowUnsignedDevelopmentRequests: boolean,
  isSuperAdmin = false,
): HandoffPermissions {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim();
  const userEmail = url.searchParams.get("userEmail")?.trim();
  if (
    (!userId || !userEmail) &&
    allowUnsignedDevelopmentRequests &&
    ["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    return {
      userId: userId || "local-developer",
      userEmail: userEmail || "developer@localhost",
      canManageSettings: true,
      canCreateTicket: true,
      isSuperAdmin: false,
    };
  }
  if (!userId || !userEmail) {
    throw new HttpError(
      401,
      "HandoffReady requires HubSpot's signed user identity metadata.",
    );
  }
  const portal = policy[String(portalId)];
  const canManageSettings =
    isSuperAdmin || (portal?.administrators.includes(userId) ?? false);
  return {
    userId,
    userEmail,
    canManageSettings,
    canCreateTicket:
      canManageSettings || (portal?.ticketCreators.includes(userId) ?? false),
    isSuperAdmin,
  };
}

export function requireSettingsAdministrator(
  permissions: HandoffPermissions,
): void {
  if (!permissions.canManageSettings) {
    throw new HttpError(
      403,
      "Your HubSpot user is not configured as a HandoffReady administrator for this portal.",
    );
  }
}

export function requireTicketCreator(permissions: HandoffPermissions): void {
  if (!permissions.canCreateTicket) {
    throw new HttpError(
      403,
      "Your HubSpot user is not configured to create HandoffReady tickets for this portal.",
    );
  }
}

function userIds(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(
      `HandoffReady policy ${name} must be an array of user IDs.`,
    );
  }
  return [...new Set(value.map((item) => (item as string).trim()))];
}
