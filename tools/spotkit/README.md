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

## Develop SpotKit

```bash
pnpm --filter @hubspotlab/spotkit test
pnpm --filter @hubspotlab/spotkit typecheck
pnpm --filter @hubspotlab/spotkit build
```

An end-to-end generated project is also validated during development by
installing it outside the repository and running its API test and all four
TypeScript checks.

## Current milestone: 0.3

Version 0.3 adds deployable generic Node, container, AWS Lambda, and Azure
Functions targets. Each scaffold includes a local runtime workspace and emits
self-contained Node.js 24 bundles without relying on an unpublished registry
package. Tunnel and release automation remain future milestones.

See [architecture](docs/architecture.md), [hosting](docs/hosting.md), and the
[roadmap](docs/roadmap.md).
