# SpotKit

SpotKit is HubSpotLab's CLI for creating and validating HubSpot-native app
projects. Its conventions are extracted from the working TidsHub and CloseReady
applications.

## Current commands

### Create a project

```bash
pnpm spotkit create handoff-ready \
  --directory projects \
  --name "HandoffReady" \
  --api-origin https://handoff.example.com \
  --support-email support@example.com
```

The generated project is independently installable and contains:

- HubSpot platform `2026.03` app metadata with OAuth and permitted URLs;
- a routed app page with a signed, portal-aware OAuth installation check;
- a deal sidebar card;
- a native Connected Apps settings page;
- a working signed settings workflow backed by encrypted, portal-specific JSON
  configuration;
- an optional, idempotent one-custom-object configuration recipe;
- a web-standard API handler and local Node adapter;
- a local `@hubspotlab/spotkit-runtime` package with OAuth install/callback,
  refresh coalescing, HubSpot signature v3 verification, and safe redirects;
- AES-256-GCM encrypted Upstash installation storage in production and an
  explicitly local-only memory adapter;
- production bundles for generic Node, AWS Lambda, and Azure Functions;
- a multi-stage, non-root Docker image, AWS SAM template, and Azure host
  manifest;
- an environment example, API test, project README, and architecture guide;
- its own pnpm workspace for standalone use.

The generator refuses to overwrite a non-empty directory. A default
`https://<slug>.example.com` origin is safe for source control but must be
replaced before upload.

### Diagnose a project

```bash
pnpm spotkit doctor projects/closeready --strict
pnpm spotkit doctor projects/closeready --json
```

Doctor currently validates:

- required product, HubSpot, API, and environment files;
- HubSpot project name and platform version;
- OAuth authentication and HTTPS callback URLs;
- the exact `/oauth/callback` route and stable (non-tunnel) production origin;
- callback-origin alignment with `permittedUrls.fetch`;
- extension backend constants aligned with permitted fetch origins;
- page, card, and settings component metadata;
- `PUBLIC_URL`, metadata, and runtime scope alignment;
- durable storage variables and a safe unsigned-request default;
- build coverage for every hosting entry point;
- container secret exclusions, non-root execution, and health checks;
- Lambda runtime, handler, and unsigned-request policy;
- placeholder origins that must not reach deployment.

Errors return a non-zero exit code. Warnings are actionable by default;
`--strict` also makes them fail CI. `--json` emits the complete report with
stable diagnostic codes for automation.

### Add HubSpot features

```bash
pnpm spotkit features
pnpm spotkit add webhooks projects/handoff-ready
pnpm spotkit add workflow-action projects/handoff-ready
pnpm spotkit add app-object projects/handoff-ready
pnpm spotkit add app-object-association projects/handoff-ready
pnpm spotkit add app-event projects/handoff-ready
pnpm spotkit add agent-tool projects/handoff-ready
```

Feature installation is additive and refuses to overwrite existing files. The
webhook recipe generates inactive subscriptions, signature verification,
payload validation, atomic retry idempotency, failure release, and tests. The
workflow action is generated unpublished with the same security and retry
boundaries. `doctor` validates each feature's metadata, handler wiring, target
URL, permitted origin, concurrency, publication flag, and object types.

The gated catalog supports one app object per project, an association for that
object, app-event definitions with an authenticated sender, and unpublished
agent tools with input validation and idempotency. HubSpot approval is still
required before uploading gated components.

## Develop SpotKit

```bash
pnpm --filter @hubspotlab/spotkit test
pnpm --filter @hubspotlab/spotkit typecheck
pnpm --filter @hubspotlab/spotkit build
```

An end-to-end generated project is also validated during development by
installing it outside the repository and running its API test and all four
TypeScript checks.

## Current milestone: 0.4

Version 0.4 adds an extensible HubSpot feature catalog with production-ready
webhooks, workflow actions, a one-app-object policy, object associations, app
events, and gated agent tools. Generic Node, containers, AWS Lambda, and Azure
Functions remain supported deployment targets. Private-app profiles are next
for app functions and SCIM.

See [architecture](docs/architecture.md), [features](docs/features.md),
[hosting](docs/hosting.md), and the [roadmap](docs/roadmap.md).
