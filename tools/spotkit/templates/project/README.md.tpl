# __SPOTKIT_DISPLAY_NAME__

__SPOTKIT_DESCRIPTION__

Generated with
[SpotKit](https://github.com/mathias7799/HubSpotLab/tree/main/tools/spotkit).
The `.spotkit.json` file records lifecycle schema and generator versions only;
HubSpot metadata remains authoritative for the app profile and features.

Run `pnpm spotkit ui <this-project>` for the interactive overview, diagnostics,
upgrade plan, origin, release, OAuth, and smoke-test workflows.

## Structure

- `apps/hubspot`: HubSpot app metadata, app page, CRM card, and settings.
- `packages/spotkit-runtime`: tested OAuth, request-signing, encryption, and token-storage boundaries.
- `services/api`: portable web-standard API with a local Node adapter.
- `docs`: product-owned documentation and decisions.

## Start locally

```bash
pnpm --dir services/api dev:local
curl http://localhost:8788/health
```

The local-only command uses disposable credentials and memory storage. Before a
real HubSpot development session, copy `services/api/.env.example` to the
ignored `services/api/.env` and add real OAuth credentials.

Open `http://localhost:8788/oauth/install` to start OAuth. Local development
uses an in-memory token store. Production refuses to start without paired
Upstash credentials and encrypts every stored installation using AES-256-GCM.
The generated app page calls the signed `/api/installation` route with its
portal ID and distinguishes a healthy connection from a missing OAuth install.
The native settings page is connected to `/api/settings` and demonstrates
encrypted, portal-specific configuration reads and writes.

The generated OAuth callback and fetch origin use `__SPOTKIT_API_ORIGIN__`.
Replace placeholder origins before uploading the HubSpot project.

## Validate

```bash
pnpm test
pnpm typecheck
pnpm spotkit doctor projects/__SPOTKIT_SLUG__
```

Before release, replace every placeholder origin and run the strict release
gate. Upload requires explicit confirmation and creates a HubSpot build without
deploying it:

```bash
pnpm spotkit release-check <this-project> --hubspot
pnpm spotkit upload <this-project> --confirm --message "Release candidate"
pnpm spotkit smoke __SPOTKIT_API_ORIGIN__
```

Run `smoke` after deploying the API and HubSpot build. Complete the authenticated
test-portal recipe in SpotKit's
[smoke-testing guide](https://github.com/mathias7799/HubSpotLab/blob/main/tools/spotkit/docs/smoke-testing.md)
before production promotion.

Capture reviewed test-portal screenshots as PNG files and refresh the product
gallery with `pnpm spotkit docs-refresh <this-project> --screenshot
"App overview=./captures/overview.png" --confirm`. The command strips common
metadata and writes stable assets under `docs/screenshots`.

## Build and host

```bash
pnpm build
docker build -t __SPOTKIT_SLUG__ .
```

The build emits generic Node, AWS Lambda, and Azure Functions entry points. See
[hosting](docs/hosting.md) for provider commands and production variables.

See [storage](docs/storage.md) to choose between the default zero-object model
and the encrypted, optional one-custom-object configuration recipe.

## Optional HubSpot features

From HubSpotLab, run `pnpm spotkit features` and `pnpm spotkit add <feature>
<this-project>` to install webhooks, workflow actions, one app object, its
association, app events, or a gated agent tool. Each installed feature includes
its own guide under `docs/features`.

This is an OAuth marketplace profile. App functions and SCIM belong in a
separate project created with `--profile private-static`; SpotKit prevents them
from being added here.

For a real HubSpot development session, run `spotkit sync-origin` to update all
callback, UI, webhook, and action URLs together, then use `spotkit dev`. If
`cloudflared` or `ngrok` is installed, `spotkit tunnel` discovers and syncs the
temporary URL automatically. See the SpotKit
[local-development guide](https://github.com/mathias7799/HubSpotLab/blob/main/tools/spotkit/docs/local-development.md).
