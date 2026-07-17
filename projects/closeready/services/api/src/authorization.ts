import type { AppConfig } from "./config.js";

export interface ActorPermissions {
  userId: string;
  userEmail: string;
  canManageRules: boolean;
  canTransition: boolean;
}

export function actorPermissions(
  request: Request,
  portalId: number,
  config: AppConfig,
): ActorPermissions {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim();
  const userEmail = url.searchParams.get("userEmail")?.trim();
  if ((!userId || !userEmail) && isLocalDevelopment(url, config)) {
    return {
      userId: userId || "local-developer",
      userEmail: userEmail || "developer@localhost",
      canManageRules: true,
      canTransition: true,
    };
  }
  if (!userId || !userEmail) {
    throw new AuthorizationError(
      401,
      "CloseReady requires HubSpot's signed user identity metadata.",
    );
  }
  const policy = config.authorizationPolicy[String(portalId)];
  const canManageRules = policy?.administrators.includes(userId) ?? false;
  return {
    userId,
    userEmail,
    canManageRules,
    canTransition:
      canManageRules || (policy?.transitioners.includes(userId) ?? false),
  };
}

export function requireRuleAdministrator(permissions: ActorPermissions): void {
  if (!permissions.canManageRules) {
    throw new AuthorizationError(
      403,
      "Your HubSpot user is not configured as a CloseReady rule administrator for this portal.",
    );
  }
}

export function requireTransitionPermission(
  permissions: ActorPermissions,
): void {
  if (!permissions.canTransition) {
    throw new AuthorizationError(
      403,
      "Your HubSpot user is not configured to perform CloseReady stage transitions for this portal.",
    );
  }
}

export class AuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

function isLocalDevelopment(url: URL, config: AppConfig): boolean {
  return (
    config.allowUnsignedDevelopmentRequests &&
    ["localhost", "127.0.0.1"].includes(url.hostname)
  );
}
