import { createRuntime } from "../runtime.js";

interface HubSpotContext {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  params?: Record<string, string>;
  path?: string;
  secrets?: Record<string, string>;
}

type SendResponse = (response: {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}) => void;

export async function main(
  context: HubSpotContext,
  sendResponse: SendResponse,
): Promise<void> {
  const env = { ...process.env, ...context.secrets };
  const { app, config } = createRuntime(env);
  const query = new URLSearchParams(context.params ?? {}).toString();
  const response = await app(
    new Request(
      `${config.publicUrl}${context.path ?? "/"}${query ? `?${query}` : ""}`,
      {
        method: context.method ?? "GET",
        ...(context.headers ? { headers: context.headers } : {}),
        ...(context.body === undefined
          ? {}
          : { body: JSON.stringify(context.body) }),
      },
    ),
  );
  sendResponse({
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  });
}
