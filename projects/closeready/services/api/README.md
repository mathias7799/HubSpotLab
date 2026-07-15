# CloseReady API

This package contains the HubSpot gateway and a web-standard `Request` to
`Response` handler. The same handler can be wrapped by Node, AWS Lambda, Azure
Functions, or HubSpot serverless adapters.

Implemented capabilities:

- provision the single `closeready_rule` custom object;
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
