import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createNodeHandler } from "../src/adapters/node-handler.js";
import type { AppConfig } from "../src/config.js";
import { MemoryTokenStore } from "../src/token-store.js";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe("local Node server", () => {
  it("starts on an ephemeral port and serves the health endpoint", async () => {
    const config: AppConfig = {
      clientId: "local-client",
      clientSecret: "local-secret",
      publicUrl: "http://localhost",
      scopes: [],
      encryptionKey: "local-encryption-key",
      port: 8787,
      allowUnsignedDevelopmentRequests: true,
    };
    const app = createApp({ config, store: new MemoryTokenStore() });
    const server = createServer(createNodeHandler(app, config.publicUrl));
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
