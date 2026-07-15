import { loadConfig } from "./config.js";
import { createService } from "./service.js";
import {
  MemoryTokenStore,
  UpstashTokenStore,
  type TokenStore,
} from "./token-store.js";

export function createRuntime(
  env: Record<string, string | undefined> = process.env,
) {
  const config = loadConfig(env);
  let store: TokenStore;
  if (config.upstashUrl && config.upstashToken) {
    store = new UpstashTokenStore(
      config.upstashUrl,
      config.upstashToken,
      config.encryptionKey,
    );
  } else if (config.allowUnsignedDevelopmentRequests) {
    store = new MemoryTokenStore();
  } else {
    throw new Error(
      "Durable encrypted token storage is required outside local development.",
    );
  }
  return { app: createService(config, store), config, store };
}
