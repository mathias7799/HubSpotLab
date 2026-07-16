import { describe, expect, it } from "vitest";

import {
  defaultScopes,
  MemoryTokenStore,
  OAuthService,
  type AppConfig,
} from "../src/index.js";

describe("OAuthService", () => {
  it("sends custom-object grants as optional scopes", () => {
    const config = {
      clientId: "client",
      clientSecret: "secret",
      publicUrl: "https://closeready.example.com",
      scopes: [
        ...defaultScopes,
        "crm.schemas.custom.read",
        "crm.objects.custom.read",
        "crm.objects.custom.write",
      ],
    } as AppConfig;
    const service = new OAuthService(config, new MemoryTokenStore());

    const url = new URL(service.installUrl());
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      ...defaultScopes,
    ]);
    expect(url.searchParams.get("optional_scope")?.split(" ")).toEqual([
      "crm.schemas.custom.read",
      "crm.objects.custom.read",
      "crm.objects.custom.write",
    ]);
  });
});
