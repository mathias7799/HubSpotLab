import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createNodeHandler } from "../src/adapters/node-handler.js";

describe("Node adapter request limits", () => {
  it("rejects a declared body larger than one MiB before invoking the app", async () => {
    const app = vi.fn(async () => Response.json({ ok: true }));
    const incoming = Readable.from([]) as unknown as IncomingMessage;
    incoming.url = "/webhooks/hubspot";
    incoming.method = "POST";
    incoming.headers = { "content-length": "1048577" };
    const headers = new Map<string, string>();
    const end = vi.fn();
    const outgoing = {
      statusCode: 0,
      setHeader: (name: string, value: string) => headers.set(name, value),
      end,
    } as unknown as ServerResponse;

    await createNodeHandler(app, "http://localhost:8788")(incoming, outgoing);

    expect(outgoing.statusCode).toBe(413);
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(end).toHaveBeenCalledWith(
      JSON.stringify({ error: "Request body exceeds 1 MiB." }),
    );
    expect(app).not.toHaveBeenCalled();
  });
});
