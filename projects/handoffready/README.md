# HandoffReady

HandoffReady turns a closed-won deal into a complete, visible sales-to-service
handoff. It checks required deal fields and company/contact associations, then
creates and links the service ticket only when the prerequisites pass.

Generated with
[SpotKit](https://github.com/mathias7799/HubSpotLab/tree/main/tools/spotkit).
The project was generated and extended through SpotKit as an end-to-end proof
of HubSpotLab's agent workflow. The `.spotkit.json` file records lifecycle schema and generator versions only;
HubSpot metadata remains authoritative for the app profile and features.

Run `pnpm spotkit ui <this-project>` for the interactive overview, diagnostics,
upgrade plan, origin, release, OAuth, and smoke-test workflows.

## Structure

- `apps/hubspot`: HubSpot app metadata, app page, CRM card, and settings.
- `packages/spotkit-runtime`: tested OAuth, request-signing, encryption, and token-storage boundaries.
- `services/api`: portable web-standard API with a local Node adapter.
- `docs`: product-owned documentation and decisions.

## Product workflow

1. An operator enables HandoffReady and configures required deal properties,
   association requirements, and the target ticket pipeline/stage.
2. The deal sidebar card evaluates live CRM data and explains every missing
   prerequisite.
3. When ready, a user creates one associated service ticket from the card.
   HandoffReady records the ticket ID in encrypted portal configuration and
   verifies the live association on every read. Renaming the ticket does not
   make the app create a duplicate.
4. The app page summarizes the ten most recently updated closed-won deals as
   complete, ready for ticket, or needing attention.
5. An unpublished deal workflow action can evaluate the same rules or create
   the ticket. Webhook subscriptions for deal creation/stage change remain
   inactive until a deployed retry test is complete.

HandoffReady uses zero custom objects. Portal settings and OAuth installations
live in encrypted durable storage, including a small deal-to-ticket identity
map; deals, companies, contacts, and tickets stay in HubSpot. The subject marker
remains a backwards-compatible discovery path and repairs missing identity
entries. If ticket association fails after creation, the API archives the new
ticket. Association cleanup and tracking failures identify the partial write
for safe recovery.

Production writes fail closed unless the signed HubSpot user is authorized in
`HANDOFFREADY_AUTHORIZATION_POLICY`. Portal administrators can edit settings and
create tickets; `ticketCreators` can create tickets but cannot change portal
configuration. Readiness views remain available to signed users. Workflow
actions are separately authenticated HubSpot automation callbacks and use their
configured action mode.

```dotenv
HANDOFFREADY_AUTHORIZATION_POLICY={"148692618":{"administrators":["12345"],"ticketCreators":["67890"]}}
```

See the [workflow proof](docs/workflow-proof.md) for the architecture decision,
commands, verified behavior, SpotKit feedback, and remaining deployment evidence.
See the [production review](docs/production-review.md) for resolved findings,
release blockers, and residual risks.

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
Every UI request is verified with HubSpot signature v3. The app page, deal card,
settings page, webhook receiver, and workflow action share the portable OAuth
runtime and portal-isolated configuration store.

The generated OAuth callback and fetch origin use `https://handoffready.example.com`.
Replace placeholder origins before uploading the HubSpot project.

## Validate

```bash
pnpm test
pnpm typecheck
pnpm spotkit doctor projects/handoffready
```

Before release, replace every placeholder origin and run the strict release
gate. Upload requires explicit confirmation and creates a HubSpot build without
deploying it:

```bash
pnpm spotkit release-check <this-project> --hubspot
pnpm spotkit upload <this-project> --confirm --message "Release candidate"
pnpm spotkit smoke https://handoffready.example.com
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
docker build -t handoffready .
```

The build emits generic Node, AWS Lambda, and Azure Functions entry points. See
[hosting](docs/hosting.md) for provider commands and production variables.

See [storage](docs/storage.md) to choose between the default zero-object model
and the encrypted, optional one-custom-object configuration recipe.

## Additional HubSpot features

Webhooks and the workflow action are already installed. From HubSpotLab, run
`pnpm spotkit features` to inspect other recipes. Do not add an app object unless
a future requirement cannot be represented by encrypted configuration or
existing CRM records.

This is an OAuth marketplace profile. App functions and SCIM belong in a
separate project created with `--profile private-static`; SpotKit prevents them
from being added here.

For a real HubSpot development session, run `spotkit sync-origin` to update all
callback, UI, webhook, and action URLs together, then use `spotkit dev`. If
`cloudflared` or `ngrok` is installed, `spotkit tunnel` discovers and syncs the
temporary URL automatically. See the SpotKit
[local-development guide](https://github.com/mathias7799/HubSpotLab/blob/main/tools/spotkit/docs/local-development.md).
