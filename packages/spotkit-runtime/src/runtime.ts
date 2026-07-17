import {
  loadRuntimeConfig,
  type LoadRuntimeConfigOptions,
  type RuntimeConfig,
} from "./config.js";
import {
  createConfigurationStore,
  type ConfigurationStore,
} from "./configuration-store.js";
import { OAuthService } from "./oauth.js";
import {
  createIdempotencyStore,
  type IdempotencyStore,
} from "./idempotency-store.js";
import { createOAuthRouter } from "./router.js";
import { assertHubSpotRequest } from "./security.js";
import { createTokenStore, type TokenStore } from "./token-store.js";

export interface RuntimeApiContext {
  config: RuntimeConfig;
  accessTokenForPortal: (portalId: number) => Promise<string>;
  verifyRequest: (request: Request, rawBody: string) => Promise<void>;
  fetcher: typeof fetch;
  configuration: ConfigurationStore;
  idempotency: IdempotencyStore;
}

export interface CreateSpotKitRuntimeOptions extends Omit<
  LoadRuntimeConfigOptions,
  "env"
> {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  tokenStore?: TokenStore;
  configurationStore?: ConfigurationStore;
  idempotencyStore?: IdempotencyStore;
  createApi: (
    context: RuntimeApiContext,
  ) => (request: Request) => Promise<Response>;
}

export function createSpotKitRuntime(options: CreateSpotKitRuntimeOptions) {
  const config = loadRuntimeConfig({
    appName: options.appName,
    namespace: options.namespace,
    requiredScopes: options.requiredScopes,
    ...(options.optionalScopes
      ? { optionalScopes: options.optionalScopes }
      : {}),
    ...(options.defaultPort ? { defaultPort: options.defaultPort } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const fetcher = options.fetcher ?? fetch;
  const store = options.tokenStore ?? createTokenStore(config, fetcher);
  const configuration =
    options.configurationStore ?? createConfigurationStore(config, fetcher);
  const idempotency =
    options.idempotencyStore ?? createIdempotencyStore(config, fetcher);
  const oauth = new OAuthService(config, store, fetcher);
  const api = options.createApi({
    config,
    accessTokenForPortal: (portalId) => oauth.accessToken(portalId),
    verifyRequest: (request, rawBody) =>
      assertHubSpotRequest(request, config, rawBody),
    fetcher,
    configuration,
    idempotency,
  });
  return {
    app: createOAuthRouter(config, oauth, api),
    config,
    oauth,
    store,
    configuration,
    idempotency,
  };
}
