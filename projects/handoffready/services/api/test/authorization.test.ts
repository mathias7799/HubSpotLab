import { describe, expect, it } from "vitest";

import {
  loadAuthorizationPolicy,
  permissionsForRequest,
  requireSettingsAdministrator,
  requireTicketCreator,
} from "../src/authorization.js";

describe("HandoffReady authorization", () => {
  const policy = loadAuthorizationPolicy(
    JSON.stringify({
      123: { administrators: ["42"], ticketCreators: ["84"] },
    }),
  );

  it("grants portal-scoped settings and ticket capabilities", () => {
    const administrator = permissionsForRequest(
      request("42", "admin@example.com"),
      123,
      policy,
      false,
    );
    expect(administrator).toMatchObject({
      canManageSettings: true,
      canCreateTicket: true,
    });

    const creator = permissionsForRequest(
      request("84", "seller@example.com"),
      123,
      policy,
      false,
    );
    expect(creator).toMatchObject({
      canManageSettings: false,
      canCreateTicket: true,
    });
  });

  it("denies unlisted users and missing signed identity", () => {
    const viewer = permissionsForRequest(
      request("99", "viewer@example.com"),
      123,
      policy,
      false,
    );
    expect(() => requireSettingsAdministrator(viewer)).toThrowError(
      /not configured as a HandoffReady administrator/,
    );
    expect(() => requireTicketCreator(viewer)).toThrowError(
      /not configured to create HandoffReady tickets/,
    );
    expect(() =>
      permissionsForRequest(
        new Request("https://handoffready.example.com/api/authorization"),
        123,
        policy,
        false,
      ),
    ).toThrowError(/signed user identity metadata/);
  });
});

function request(userId: string, userEmail: string): Request {
  const query = new URLSearchParams({ userId, userEmail });
  return new Request(
    `https://handoffready.example.com/api/authorization?${query}`,
  );
}
