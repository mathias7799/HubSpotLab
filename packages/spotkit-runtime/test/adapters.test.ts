import { describe, expect, it } from "vitest";

import {
  createAwsLambdaHandler,
  createAzureFunctionsHandler,
} from "../src/index.js";

const application = async (request: Request): Promise<Response> =>
  Response.json(
    {
      method: request.method,
      path: new URL(request.url).pathname,
      query: new URL(request.url).search,
      cookie: request.headers.get("cookie"),
      body: await request.text(),
    },
    { status: 201, headers: { "Set-Cookie": "session=secure; HttpOnly" } },
  );

describe("hosting adapters", () => {
  it("translates API Gateway v2 events and preserves cookies", async () => {
    const handler = createAwsLambdaHandler(
      application,
      "https://api.example.test",
    );
    const result = await handler({
      rawPath: "/webhook",
      rawQueryString: "portalId=123",
      headers: { "content-type": "text/plain" },
      cookies: ["first=1", "second=2"],
      body: Buffer.from("payload").toString("base64"),
      isBase64Encoded: true,
      requestContext: { http: { method: "POST" } },
    });

    expect(result.statusCode).toBe(201);
    expect(result.cookies).toEqual(["session=secure; HttpOnly"]);
    expect(
      JSON.parse(Buffer.from(result.body, "base64").toString("utf8")),
    ).toMatchObject({
      method: "POST",
      path: "/webhook",
      query: "?portalId=123",
      cookie: "first=1; second=2",
      body: "payload",
    });
  });

  it("translates Azure HTTP requests and binary-safe responses", async () => {
    const handler = createAzureFunctionsHandler(application);
    const result = await handler({
      url: "https://api.example.test/callback?code=one",
      method: "POST",
      headers: new Headers({ cookie: "state=two" }),
      async arrayBuffer() {
        return Uint8Array.from(Buffer.from("azure-body")).buffer;
      },
    });

    expect(result.status).toBe(201);
    expect(result.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(Buffer.from(result.body).toString("utf8"))).toMatchObject(
      {
        path: "/callback",
        query: "?code=one",
        cookie: "state=two",
        body: "azure-body",
      },
    );
  });
});
