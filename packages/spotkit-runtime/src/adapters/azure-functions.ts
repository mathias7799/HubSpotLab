export interface AzureHttpRequest {
  url: string;
  method: string;
  headers: Headers;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface AzureHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

export function createAzureFunctionsHandler(
  application: (request: Request) => Promise<Response>,
) {
  return async (incoming: AzureHttpRequest): Promise<AzureHttpResponse> => {
    const method = incoming.method || "GET";
    const body = await incoming.arrayBuffer();
    const response = await application(
      new Request(incoming.url, {
        method,
        headers: incoming.headers,
        ...(body.byteLength ? { body } : {}),
      }),
    );
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    return {
      status: response.status,
      headers,
      body: new Uint8Array(await response.arrayBuffer()),
    };
  };
}
