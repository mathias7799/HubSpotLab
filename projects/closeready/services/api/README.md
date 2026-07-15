# CloseReady API

This package contains the HubSpot gateway and a web-standard `Request` to
`Response` handler. The same handler can be wrapped by Node, AWS Lambda, Azure
Functions, or HubSpot serverless adapters.

Implemented capabilities:

- locate the single app-managed `CLOSEREADY_RULE` object;
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

CloseReady does not attempt to create a custom schema through OAuth. HubSpot
requires app-object approval for the `CloseReady` prefix and `CLOSEREADY_RULE`
name. The component template lives in
`apps/hubspot/app-object-template/app-object-hsmeta.json`; move it to
`apps/hubspot/src/app/app-objects/` only after approval. The JSON schema in
`schema/` is a development-only fallback for a portal administrator with a
personal access key that includes custom-schema write access.
