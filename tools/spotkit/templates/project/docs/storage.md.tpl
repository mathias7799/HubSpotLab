# __SPOTKIT_DISPLAY_NAME__ storage

SpotKit defaults to zero custom objects: OAuth installations and application
configuration are encrypted in Upstash. This is the simplest option and leaves
the portal's custom-object allowance untouched.

## Optional one-object configuration

`services/api/src/storage/hubspot-configuration.ts` provides an opt-in store
that provisions exactly one `__SPOTKIT_SLUG__` configuration object per portal.
It creates only two properties: a unique configuration key and an encrypted
value. Plaintext settings and OAuth tokens are never stored in HubSpot.

Before using it, add these optional OAuth scopes to app metadata and runtime
scope configuration:

```json
[
  "crm.schemas.custom.read",
  "crm.objects.custom.read",
  "crm.objects.custom.write"
]
```

Then create the store once inside `createApi` and use it instead of the default
`configuration` value:

```ts
createApi: (context) => {
  const configuration = createHubSpotConfigurationStore(context);
  return async (request) => {
    // Use configuration.get/put/delete with the signed request's portal ID.
  };
};
```

Schema provisioning is idempotent and coalesced per portal. Some HubSpot
accounts or app-review states may not permit OAuth schema creation; keep the
default Upstash store when that capability is unavailable. OAuth installations
always remain in encrypted external storage because access is required before a
portal-owned custom object can be read.
