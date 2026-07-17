export function createApp() {
  return async function app(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "__SPOTKIT_SLUG__-api" });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };
}
