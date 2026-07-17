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
- a routed app page with an API health check;
- a deal sidebar card;
- a native Connected Apps settings page;
- a web-standard API handler and local Node adapter;
- an environment example, API test, project README, and architecture guide;
- its own pnpm workspace for standalone use.

The generator refuses to overwrite a non-empty directory. A default
`https://<slug>.example.com` origin is safe for source control but must be
replaced before upload.

### Diagnose a project

```bash
pnpm spotkit doctor projects/closeready
```

Doctor currently validates:

- required product, HubSpot, API, and environment files;
- HubSpot project name and platform version;
- OAuth authentication and HTTPS callback URLs;
- callback-origin alignment with `permittedUrls.fetch`;
- extension backend constants aligned with permitted fetch origins;
- page, card, and settings component metadata;
- required OAuth API environment variables;
- placeholder origins that must not reach deployment.

Errors return a non-zero exit code. Warnings are actionable but do not fail the
command, which makes doctor suitable for local checks and CI.

## Develop SpotKit

```bash
pnpm --filter @hubspotlab/spotkit test
pnpm --filter @hubspotlab/spotkit typecheck
pnpm --filter @hubspotlab/spotkit build
```

An end-to-end generated project is also validated during development by
installing it outside the repository and running its API test and all four
TypeScript checks.

## Scope of version 0.1

Version 0.1 establishes the CLI, generator contract, health API shell, and
configuration diagnostics. It does not yet generate OAuth token exchange,
signature verification, durable storage, cloud adapters, tunnels, or deployment
automation. Those features will be extracted from TidsHub and CloseReady behind
stable shared packages instead of copied into every template.

See [architecture](docs/architecture.md) and the [roadmap](docs/roadmap.md).
