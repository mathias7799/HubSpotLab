# SpotKit

SpotKit is HubSpotLab's CLI for creating and validating HubSpot-native app
projects. Its conventions are extracted from the working TidsHub and CloseReady
applications.

For an interactive all-in-one project dashboard:

```bash
pnpm spotkit ui
pnpm dlx @hubspotlab/spotkit ui projects
```

The terminal UI discovers projects and brings overview, doctor, upgrades,
manifest adoption, origin synchronization, releases, OAuth reconnect, and
deployed smoke checks into one confirmation-safe workflow.

Run the published CLI without installing it globally:

```bash
pnpm dlx @hubspotlab/spotkit --help
pnpm dlx @hubspotlab/spotkit create handoff-ready \
  --name "HandoffReady" \
  --api-origin https://handoff.example.com \
  --support-email support@example.com
```

## Current commands

### Create a project

```bash
pnpm spotkit create handoff-ready \
  --directory projects \
  --name "HandoffReady" \
  --api-origin https://handoff.example.com \
  --support-email support@example.com
```

For HubSpot-only components that require a static private app:

```bash
pnpm spotkit create identity-ops \
  --directory projects \
  --name "Identity Ops" \
  --profile private-static
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
- a 1 MiB Node-adapter request-body limit with an explicit 413 response;
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

Inventory an app without changing it:

```bash
pnpm spotkit inspect projects/closeready
pnpm spotkit inspect projects/closeready --json
```

`inspect` reports the app profile, HubSpot platform, API origin, installed
component features, app-object count, diagnostic totals, and strict release
readiness. It derives the inventory from HubSpot metadata, so generated and
adopted projects use the same source of truth.

Generated projects include a minimal `.spotkit.json` lifecycle manifest. It
records only the manifest schema and SpotKit creation/update versions; profile,
features, origins, and scopes remain authoritative in HubSpot metadata. Adopt an
existing project or verify manifest drift with:

```bash
pnpm spotkit manifest projects/my-app --confirm
pnpm spotkit manifest projects/my-app --check
```

Plan an upgrade without changing project files:

```bash
pnpm spotkit upgrade projects/my-app
pnpm spotkit upgrade projects/my-app --json
```

The planner compares lifecycle versions and every managed embedded-runtime file,
then combines those differences with current diagnostics. It never overwrites a
runtime file: missing, modified, and project-only files are listed for explicit
review and merge.

Inventory every HubSpot project below a monorepo directory:

```bash
pnpm spotkit inventory projects
pnpm spotkit inventory projects --json
pnpm spotkit inventory projects --strict
```

The report aggregates profiles, inferred components, app-object usage, errors,
warnings, and release readiness. `--strict` fails unless at least one project is
found and every discovered project has zero diagnostic errors and warnings.

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
Workflow actions may replace the generated example route and handler name;
doctor follows the metadata URL and verifies that exact route is wired in the
feature handler.

The gated catalog supports one app object per project, an association for that
object, app-event definitions with an authenticated sender, and unpublished
agent tools with input validation and idempotency. HubSpot approval is still
required before uploading gated components.

Private-static projects can add `app-function-endpoint`,
`app-function-private`, and `scim`. SpotKit rejects these components in an OAuth
marketplace project and rejects marketplace-only app objects or events in the
private profile. App functions remain entirely optional.

### Develop with a public origin

```bash
cp projects/handoff-ready/services/api/.env.example \
  projects/handoff-ready/services/api/.env
# Add real local OAuth credentials, then:
pnpm spotkit sync-origin https://your-stable-or-tunnel.example \
  projects/handoff-ready --check
pnpm spotkit sync-origin https://your-stable-or-tunnel.example \
  projects/handoff-ready
pnpm spotkit dev projects/handoff-ready --check
pnpm spotkit dev projects/handoff-ready
```

`sync-origin` updates OAuth callbacks, permitted fetch URLs, both UI backend
constants, API environment files, webhooks, workflow actions, and agent tools.
`--check` previews without writing. `dev` loads the ignored API `.env`, starts
the API and `hs project dev`, and supervises both processes.

With `cloudflared` or `ngrok` installed, SpotKit can discover and synchronize a
temporary URL automatically:

```bash
pnpm spotkit tunnel projects/handoff-ready --provider cloudflare
pnpm spotkit tunnel projects/handoff-ready --provider ngrok
```

Temporary origins intentionally remain visible after the process exits, so
`doctor --strict` prevents accidental release until a stable origin is restored.
`spotkit reconnect` prints the OAuth URL for review; only `--open` launches it.

### Check and smoke-test a release

```bash
pnpm spotkit release-check projects/handoff-ready --hubspot
pnpm spotkit upload projects/handoff-ready --confirm \
  --message "Release candidate"
pnpm spotkit smoke https://api.handoff.example.com
```

Release check combines strict SpotKit diagnostics, secret and deployment-origin
scanning, and optional official HubSpot validation. `upload` refuses to run
without `--confirm`; it creates a HubSpot project build but never deploys that
build. After deployment, `smoke` checks the health, browser-security, and OAuth
boundaries without installing the app or mutating CRM data.

### Refresh product screenshots

Capture authenticated HubSpot views in a test portal, review them for customer
data, then let SpotKit normalize and index the PNG files:

```bash
pnpm spotkit docs-refresh projects/handoff-ready \
  --screenshot "App overview=./captures/overview.png" \
  --screenshot "Deal card=./captures/deal-card.png" \
  --confirm
```

The command strips common PNG metadata, creates stable file names, and writes a
deterministic `docs/screenshots/README.md` gallery and SHA-256 manifest. Run the
same command with `--check` in CI to detect stale documentation. It never opens
an authenticated browser or reuses browser cookies.

## Develop SpotKit

```bash
pnpm --filter @hubspotlab/spotkit test
pnpm --filter @hubspotlab/spotkit typecheck
pnpm --filter @hubspotlab/spotkit build
```

An end-to-end generated project is also validated during development by
installing it outside the repository and running its API test and all four
TypeScript checks.

## Current milestone: 0.7

Version 0.6 delivered a self-contained npm artifact, strict release and smoke
workflows, and provenance publishing. The 0.7 lifecycle milestone starts with
read-only inventory for generated and adopted apps, then adds explicit project
manifests, review-first upgrades, and monorepo compatibility reporting.

See [architecture](docs/architecture.md), [features](docs/features.md),
[hosting](docs/hosting.md), [local development](docs/local-development.md), and
the [existing-app adoption guide](docs/adopting-existing-apps.md),
[release guide](docs/releasing.md), [smoke-testing guide](docs/smoke-testing.md),
[terminal UI guide](docs/terminal-ui.md), [changelog](CHANGELOG.md), and
[roadmap](docs/roadmap.md).
