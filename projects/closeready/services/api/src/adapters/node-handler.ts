import type { IncomingMessage, ServerResponse } from "node:http";

const maxRequestBodyBytes = 1_048_576;

export function createNodeHandler(
  app: (request: Request) => Promise<Response>,
  publicUrl: string,
) {
  return async (
    incoming: IncomingMessage,
    outgoing: ServerResponse,
  ): Promise<void> => {
    try {
      const declaredLength = Number(incoming.headers["content-length"] ?? 0);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > maxRequestBodyBytes
      ) {
        payloadTooLarge(outgoing);
        incoming.resume();
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      for await (const chunk of incoming) {
        const buffer = Buffer.from(chunk);
        received += buffer.length;
        if (received > maxRequestBodyBytes) {
          payloadTooLarge(outgoing);
          incoming.resume();
          return;
        }
        chunks.push(buffer);
      }
      const body = Buffer.concat(chunks);
      const request = new Request(new URL(incoming.url ?? "/", publicUrl), {
        method: incoming.method ?? "GET",
        headers: Object.entries(incoming.headers).flatMap(([name, value]) =>
          value === undefined
            ? []
            : ([[name, Array.isArray(value) ? value.join(",") : value]] as [
                string,
                string,
              ][]),
        ),
        ...(body.length ? { body } : {}),
      });
      const response = await app(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) =>
        outgoing.setHeader(name, value),
      );
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (cause) {
      console.error(cause);
      outgoing.statusCode = 500;
      outgoing.setHeader("Content-Type", "application/json");
      outgoing.end(JSON.stringify({ error: "Internal server error" }));
    }
  };
}

function payloadTooLarge(outgoing: ServerResponse): void {
  outgoing.statusCode = 413;
  outgoing.setHeader("Cache-Control", "no-store");
  outgoing.setHeader("Content-Type", "application/json");
  outgoing.end(JSON.stringify({ error: "Request body exceeds 1 MiB." }));
}
