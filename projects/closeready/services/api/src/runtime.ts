import { loadConfig } from "./config.js";
import { createService } from "./service.js";
import {
  MemoryTokenStore,
  UpstashTokenStore,
  type TokenStore,
} from "./token-store.js";
import {
  MemoryRuleStore,
  UpstashRuleStore,
  type RuleStore,
} from "./rule-store.js";

export function createRuntime(
  env: Record<string, string | undefined> = process.env,
) {
  const config = loadConfig(env);
  let store: TokenStore;
  let ruleStore: RuleStore;
  if (config.upstashUrl && config.upstashToken) {
    store = new UpstashTokenStore(
      config.upstashUrl,
      config.upstashToken,
      config.encryptionKey,
    );
    ruleStore = new UpstashRuleStore(
      config.upstashUrl,
      config.upstashToken,
      config.encryptionKey,
    );
  } else if (config.allowUnsignedDevelopmentRequests) {
    store = new MemoryTokenStore();
    ruleStore = new MemoryRuleStore();
  } else {
    throw new Error(
      "Durable encrypted token storage is required outside local development.",
    );
  }
  return {
    app: createService(config, store, ruleStore),
    config,
    store,
    ruleStore,
  };
}
