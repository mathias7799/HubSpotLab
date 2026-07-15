# CloseReady API

This package contains the HubSpot gateway and a web-standard `Request` to
`Response` handler. The same handler can be wrapped by Node, AWS Lambda, Azure
Functions, or HubSpot serverless adapters.

Implemented capabilities:

- create or locate the single `closeready_rule` custom object where available;
- fall back to encrypted portable rule storage on non-Enterprise portals;
- discover deal pipelines and deal/contact/company properties;
- discover HubSpot deal-to-contact and deal-to-company association labels;
- create, list, update, and archive rules;
- collect current deal, association, and metric data;
- evaluate a proposed stage transition;
- update the deal stage only after a guarded evaluation passes.

OAuth, AES-256-GCM encrypted Upstash token persistence, HubSpot signature v3
verification, and a local Node adapter are included. The core HTTP handler still
injects these boundaries so cloud-specific adapters remain small.

For local API work:

```bash
pnpm --dir projects/closeready/services/api dev:local
curl http://localhost:8788/health
```

The local command uses in-memory token and rule stores and accepts unsigned requests
only on `localhost`/`127.0.0.1`. A durable encrypted store is mandatory outside
development.

With `RULE_STORAGE=auto` (the default), CloseReady uses the same idempotent
provisioning model as TidsHub. A setup check lists the portal's custom schemas,
attempts to create `closeready_rule` when absent, and reuses it on later calls.
The provisioner never creates a second custom object. When HubSpot returns an
entitlement or schema-scope error, CloseReady transparently stores rules in the
encrypted Upstash store instead. `RULE_STORAGE=hubspot` makes the custom object
mandatory; `RULE_STORAGE=external` skips schema provisioning entirely.

Custom objects are an Enterprise HubSpot feature, and marketplace OAuth does
not receive schema-write access on every eligible portal. Enterprise admins can
use the checked-in
`schema/closeready-rule.schema.json` with `hs custom-object create-schema` for
the one-time portal bootstrap. Standard portals need no bootstrap and use the
portable store automatically.

The default OAuth scope set is intentionally universal. To opt an Enterprise
installation into native rule storage, add `crm.schemas.custom.read`,
`crm.objects.custom.read`, and `crm.objects.custom.write` to `HUBSPOT_SCOPES`;
the app declares these as optional scopes so Standard installations remain
valid.
