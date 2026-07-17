import type { IncomingMessage, ServerResponse } from "node:http";

export function createNodeHandler(
  app: (request: Request) => Promise<Response>,
  publicUrl: string,
) {
  return async (
    incoming: IncomingMessage,
    outgoing: ServerResponse,
  ): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const response = await app(
      new Request(new URL(incoming.url ?? "/", publicUrl), {
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
      }),
    );
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  };
}
