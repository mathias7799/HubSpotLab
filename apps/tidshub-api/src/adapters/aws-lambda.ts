import { createRuntime } from "../runtime.js";

interface LambdaEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  requestContext: { http: { method: string } };
  body?: string;
  isBase64Encoded?: boolean;
}

const { app, config } = createRuntime();

export async function handler(event: LambdaEvent) {
  const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body
    : undefined;
  const response = await app(
    new Request(`${config.publicUrl}${event.rawPath}${query}`, {
      method: event.requestContext.http.method,
      headers: cleanHeaders(event.headers ?? {}),
      ...(body !== undefined ? { body } : {}),
    }),
  );
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
    isBase64Encoded: false,
  };
}

function cleanHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
