import { createRuntime } from "../runtime.js";

interface AzureRequest {
  url: string;
  method: string;
  headers: Headers | Record<string, string>;
  text(): Promise<string>;
}

const { app } = createRuntime();

export async function handler(request: AzureRequest): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
}> {
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();
  const response = await app(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      ...(body ? { body } : {}),
    }),
  );
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}
