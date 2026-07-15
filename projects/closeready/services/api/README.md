# CloseReady API

This package contains the HubSpot gateway and a web-standard `Request` to
`Response` handler. The same handler can be wrapped by Node, AWS Lambda, Azure
Functions, or HubSpot serverless adapters.

Implemented capabilities:

- create or locate the single `closeready_rule` custom object;
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

The local command uses an in-memory token store and accepts unsigned requests
only on `localhost`/`127.0.0.1`. A durable encrypted store is mandatory outside
development.

CloseReady uses the same idempotent provisioning model as TidsHub. A setup check
lists the portal's custom schemas, attempts to create `closeready_rule` when
absent, and reuses it on later calls. The creation payload contains every
required rule property, and the provisioner never creates a second custom
object.

HubSpot marketplace OAuth currently rejects schema creation without an
administrator schema-write grant. Use the checked-in
`schema/closeready-rule.schema.json` with `hs custom-object create-schema` for
the one-time portal bootstrap. Runtime rule CRUD then uses the normal
`crm.objects.custom.read` and `crm.objects.custom.write` OAuth scopes.
