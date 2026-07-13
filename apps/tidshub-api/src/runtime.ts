import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
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
      "A durable token store is required outside local development. Configure Upstash REST credentials.",
    );
  }
  return { app: createApp({ config, store }), config, store };
}
