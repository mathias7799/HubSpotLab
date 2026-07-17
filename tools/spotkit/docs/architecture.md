# SpotKit architecture

SpotKit has four boundaries:

1. `src/cli.ts` owns argument parsing, terminal output, and process exit codes.
2. `src/create.ts` owns deterministic template expansion and safe filesystem
   creation.
3. `src/doctor.ts` owns read-only project diagnostics and machine-testable
   results.
4. `packages/spotkit-runtime` owns OAuth, signing, encryption, token refresh,
   and durable installation storage.

The exported create and doctor functions do not write to stdout or terminate
the process. This keeps the core usable from tests, future agent skills, and
other developer tools.

## Template contract

Templates live under `templates/project`. Files ending in `.tpl` lose that
suffix during generation. SpotKit replaces a small explicit token set for the
project slug, safe HubSpot UID, display name, description, API origin, and
support email.

User-controlled values have separate JSON-escaped tokens for JSON and
TypeScript string contexts. Project slugs are restricted to lowercase
kebab-case and output creation fails when the target directory is non-empty.

## Generated trust boundary

The template separates HubSpot-rendered UI from the portable API. The API wraps
domain routes with `createSpotKitRuntime`, which owns OAuth install and callback
routes, signed state, cookie binding, token refresh, and signature verification.
HubSpot credentials and access tokens never enter UI extensions.

Production configuration requires HTTPS, a 32-character encryption secret, and
paired Upstash REST credentials. Installations are sealed with AES-256-GCM using
namespace-bound key derivation and associated data. The memory store and
unsigned request bypass are accepted only when `PUBLIC_URL` is localhost.

The same boundary exposes a separate per-portal configuration store. Domain
values must be valid JSON, use validated keys, and stay below 64 KiB. Associated
data contains the app namespace, portal, and key, preventing ciphertext from
being moved between tenants or settings.

Apps that prefer portal-owned configuration can opt into
`HubSpotObjectConfigurationStore`. It provisions exactly one compact schema with
a unique key and encrypted value, coalesces concurrent provisioning, and keeps
OAuth installations external so the portal object can always be accessed.

The generator copies the tested runtime into the new project's `packages`
workspace. This preserves standalone installs while keeping the API's domain
code behind a stable package interface.

## Hosting boundary

Domain code consumes web-standard `Request` and returns `Response`. Small
adapters translate Node HTTP, API Gateway v2, and Azure HTTP shapes only at the
outermost boundary. esbuild emits independent Node.js 24 bundles, so production
never executes TypeScript or resolves workspace source.

The container receives only the Node bundle. The Lambda adapter keeps response
cookies separate from ordinary headers, while both cloud adapters preserve
binary request and response bodies.

## Feature boundary

`spotkit add` copies an official-shape component recipe and integrates its route
at explicit markers in the generated API. It preflights every output and refuses
partial overwrites. Webhooks and workflow actions share signature verification
and a hashed atomic idempotency store; handlers release failed claims so provider
retries remain useful.

Metadata-only features use the same non-overwriting installer. Doctor enforces
the one-app-object policy, association dependencies, event definitions,
generated send helpers, and agent-tool client compatibility. Gated metadata is
also checked with HubSpot's official project validator during releases.

## Project profiles

The default `marketplace` profile owns OAuth, portable hosting, encrypted token
storage, and customer-account installation. The `private-static` profile is a
separate minimal project for HubSpot-hosted app functions and SCIM. It does not
pretend to have an OAuth backend or copy the SpotKit runtime.

Feature installation reads the app's distribution and auth type before writing
files. Invalid cross-profile combinations fail early and serverless functions
remain optional.

## Diagnostic model

Doctor returns structured diagnostics with `success`, `warning`, or `error`
levels and stable codes. The CLI renders these for humans or emits the same
report as JSON. Strict mode promotes warnings to a failing process exit without
changing their diagnostic level.
