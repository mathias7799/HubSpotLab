import {
  HubSpotObjectConfigurationStore,
  type RuntimeApiContext,
} from "@hubspotlab/spotkit-runtime";

/**
 * Optional one-custom-object recipe. Add the scopes documented in
 * docs/storage.md before selecting this store in the API application.
 */
export function createHubSpotConfigurationStore(
  context: RuntimeApiContext,
): HubSpotObjectConfigurationStore {
  return new HubSpotObjectConfigurationStore({
    appName: context.config.appName,
    namespace: context.config.namespace,
    encryptionKey: context.config.encryptionKey,
    accessTokenForPortal: context.accessTokenForPortal,
    fetcher: context.fetcher,
  });
}
