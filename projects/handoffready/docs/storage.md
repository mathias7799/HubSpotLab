# HandoffReady storage

SpotKit defaults to zero custom objects: OAuth installations and application
configuration are encrypted in Upstash. This is the simplest option and leaves
the portal's custom-object allowance untouched. Route definitions and the
deal/route-to-output identity map share the same portal-isolated encrypted
configuration boundary; HubSpot tickets, tasks, and projects remain native CRM
records.

## Optional one-object configuration

Set `HANDOFFREADY_CONFIGURATION_STORAGE=hubspot-object` to use the runtime's
tested one-object adapter. It discovers exactly one
`handoffready_configuration` object per portal and stores a unique
configuration key plus an encrypted value. Plaintext settings and OAuth tokens
are never stored in HubSpot.

Before using it, add these optional OAuth scopes to app metadata and runtime
scope configuration:

```json
[
  "crm.schemas.custom.read",
  "crm.objects.custom.read",
  "crm.objects.custom.write"
]
```

Marketplace OAuth can read and write custom-object records but does not receive
general schema-administration access. If HubSpot denies the adapter's
idempotent schema-create attempt, a Super Admin creates one object in **Data
Management → Data Model** with:

- internal object name `handoffready_configuration`;
- a unique primary text property (the adapter reads its actual internal name);
- a text property with internal name `encrypted_value`.

The adapter addresses that schema directly, supports both `config_key` and
administrator-chosen primary-property names, and uses unique-property record
lookup instead of the eventually indexed search endpoint. OAuth installations
always remain in encrypted external storage because access is required before a
portal-owned custom object can be read.
