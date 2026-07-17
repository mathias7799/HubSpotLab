export interface ApiGatewayV2Event {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

export interface ApiGatewayV2Result {
  statusCode: number;
  headers: Record<string, string>;
  cookies?: string[];
  body: string;
  isBase64Encoded: boolean;
}

export function createAwsLambdaHandler(
  application: (request: Request) => Promise<Response>,
  publicUrl: string,
) {
  const origin = validatedOrigin(publicUrl);
  return async (event: ApiGatewayV2Event): Promise<ApiGatewayV2Result> => {
    const method = event.requestContext?.http?.method ?? "GET";
    const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
    const headers = new Headers();
    for (const [name, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined) headers.set(name, value);
    }
    if (event.cookies?.length) headers.set("cookie", event.cookies.join("; "));
    const body = event.body
      ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
      : undefined;
    const response = await application(
      new Request(new URL(`${event.rawPath}${query}`, origin), {
        method,
        headers,
        ...(body?.length ? { body } : {}),
      }),
    );
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") responseHeaders[name] = value;
    });
    const cookies = response.headers.getSetCookie();
    return {
      statusCode: response.status,
      headers: responseHeaders,
      ...(cookies.length ? { cookies } : {}),
      body: Buffer.from(await response.arrayBuffer()).toString("base64"),
      isBase64Encoded: true,
    };
  };
}

function validatedOrigin(value: string): string {
  const url = new URL(value);
  if (url.origin !== value && `${url.origin}/` !== value) {
    throw new Error("publicUrl must be an absolute origin.");
  }
  return url.origin;
}
