# Adopting an existing HubSpot app

SpotKit can validate and operate an existing app without regenerating it. Keep
the product's domain code and UI; adopt the project contract incrementally.

## 1. Establish a baseline

```bash
pnpm spotkit doctor projects/my-app --json
pnpm spotkit sync-origin https://api.my-app.com projects/my-app --check
```

Commit or set aside unrelated work before applying synchronization. The command
only updates recognized OAuth callbacks, permitted fetch origins, UI backend
constants, API environment files, and installed feature targets.

## 2. Align the configuration example

The checked-in `services/api/.env.example` should describe production-safe
defaults without containing secrets:

```dotenv
HUBSPOT_CLIENT_ID=
HUBSPOT_CLIENT_SECRET=
HUBSPOT_SCOPES=oauth crm.objects.deals.read
PUBLIC_URL=https://api.my-app.com
TOKEN_ENCRYPTION_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS=false
```

Use the app metadata's required OAuth scopes. Product-specific variables can
remain alongside these fields. Local scripts may explicitly opt into localhost
and unsigned development; the production-facing example must not.

## 3. Synchronize and diagnose

```bash
pnpm spotkit sync-origin https://api.my-app.com projects/my-app
pnpm spotkit doctor projects/my-app --strict
```

Placeholder and tunnel origins intentionally fail strict diagnostics. Do not
replace one with an invented production URL merely to make the check green.

## 4. Adopt runtime boundaries deliberately

Existing OAuth and domain code does not need to be replaced in one change. Keep
these boundaries while migrating shared concerns to `@hubspotlab/spotkit-runtime`:

- UI extensions never receive OAuth credentials or access tokens;
- the portable API owns OAuth callbacks, refresh, encryption, and signatures;
- production token storage is durable, encrypted, and portal-scoped;
- unsigned requests and memory storage remain localhost-only;
- domain handlers consume web-standard `Request` and return `Response`.

Move one boundary at a time and keep the app's existing contract tests running.
SpotKit-generated apps embed the runtime as a local workspace package; apps in
HubSpotLab may depend on the repository's shared package directly.

## 5. Release from evidence

```bash
pnpm spotkit release-check projects/my-app --hubspot
pnpm spotkit upload projects/my-app --confirm --message "Migration candidate"
pnpm spotkit smoke https://api.my-app.com
```

Upload creates a build but does not deploy it. Review the build, deploy it to a
test account, complete the authenticated browser recipe, and only then promote
it. The migration is complete when strict diagnostics and the product's own
tests pass without weakening its security or behavior.

## HubSpotLab reference migrations

TidsHub and CloseReady retain their product-specific services and UI. Their
environment examples now match their app metadata and SpotKit's production-safe
defaults. Both are checked with SpotKit doctor in addition to their existing
test and typecheck suites; CloseReady will retain a placeholder-origin warning
until an operator supplies its real deployment origin.
