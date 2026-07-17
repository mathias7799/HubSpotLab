import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("__SPOTKIT_DISPLAY_NAME_JSON__ API", () => {
  it("reports health", async () => {
    const response = await createApp()(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
