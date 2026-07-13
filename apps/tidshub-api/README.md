# TidsHub API

Portable OAuth backend for the TidsHub HubSpot app. The domain logic uses the
standard `Request`/`Response` API; hosting adapters only translate platform
events into that contract.

## Responsibilities

- HubSpot OAuth install, callback, and automatic token refresh
- encrypted, durable installation storage
- verification of HubSpot-signed extension requests
- idempotent provisioning of exactly one TidsHub custom object
- weekly time-entry search, creation, editing, and deletion
- optional association of a time entry to the current CRM record
- searchable project, contact, company, deal, ticket, and task associations
- one primary CRM association plus an independent optional task association
- approval-officer settings, week submission, and approval authorization

The provisioner first looks for both the original `tidshub_record` schema and
the manually created `tidshub_poster` schema. It reuses either one, so an
existing portal does not receive a second custom object.

## Local development

For a health-check-only local server, no credentials are needed:

```bash
pnpm tidshub:api:local
curl http://localhost:8799/health
```

For a real OAuth round trip, copy `.env.example` to `.env.local`, fill in
a HubSpot development app's client ID and secret, then run:

```bash
pnpm --filter @hubspotlab/tidshub-api dev
```

Set the app's local OAuth redirect URL to
`http://localhost:8799/oauth/callback`, then open
`http://localhost:8799/oauth/install`. A tunnel such as Cloudflare Tunnel or
ngrok is required when HubSpot must reach a callback on your machine.

`ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS=true` is accepted only for requests whose
URL hostname is `localhost`. It also enables the in-memory token store. Never
use that combination in production.

## Required production configuration

| Variable                   | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `HUBSPOT_CLIENT_ID`        | OAuth app client ID                           |
| `HUBSPOT_CLIENT_SECRET`    | OAuth secret and request-signature secret     |
| `HUBSPOT_SCOPES`           | Optional space/comma-separated scope override |
| `PUBLIC_URL`               | Public origin, without a trailing slash       |
| `TOKEN_ENCRYPTION_KEY`     | Encrypts OAuth installations before storage   |
| `UPSTASH_REDIS_REST_URL`   | Durable REST Redis endpoint                   |
| `UPSTASH_REDIS_REST_TOKEN` | REST Redis bearer token                       |

The API refuses to start in production without a durable token store. The
memory store is intentionally local-only.

## Routes

| Method   | Route                                 | Purpose                                    |
| -------- | ------------------------------------- | ------------------------------------------ |
| `GET`    | `/health`                             | Readiness check                            |
| `GET`    | `/oauth/install`                      | Begin OAuth installation                   |
| `GET`    | `/oauth/callback`                     | Exchange and store OAuth tokens            |
| `POST`   | `/api/provision?portalId=…`           | Reuse/create the one object and properties |
| `GET`    | `/api/entries?portalId=…&from=…&to=…` | Weekly records                             |
| `POST`   | `/api/entries?portalId=…`             | Create a record and optional association   |
| `PATCH`  | `/api/entries/:id?portalId=…`         | Edit an owned, unlocked time entry         |
| `DELETE` | `/api/entries/:id?portalId=…`         | Delete an owned, unlocked time entry       |
| `GET`    | `/api/crm/search?portalId=…`          | Search supported CRM records               |
| `GET`    | `/api/users?portalId=…`               | List users available as approval officers  |
| `GET`    | `/api/approval-settings?portalId=…`   | Read a user's approval officer             |
| `PUT`    | `/api/approval-settings?portalId=…`   | Save a user's approval officer             |
| `GET`    | `/api/week?portalId=…`                | Read week submission state                 |
| `POST`   | `/api/week/submit?portalId=…`         | Submit a week for approval                 |
| `GET`    | `/api/approvals/pending?portalId=…`   | List weeks assigned to an approver         |
| `POST`   | `/api/week/approve?portalId=…`        | Approve an assigned week                   |

The `/api/*` routes validate HubSpot signature v3 and reject timestamps older
than five minutes.

## Hosting adapters

- `src/adapters/node.ts`: any Node 20+ host, container, VM, Fly.io, Render, etc.
- `src/adapters/aws-lambda.ts`: Lambda Function URL or API Gateway HTTP API v2
- `src/adapters/azure-functions.ts`: Azure Functions HTTP trigger
- `src/adapters/hubspot-serverless.ts`: optional reference adapter for portals
  that already include HubSpot serverless functions

All adapters use the same environment variables and durable token store. See
`deploy/` for starter manifests. Build first with:

```bash
pnpm --filter @hubspotlab/tidshub-api build
```

For AWS and Azure, point the platform handler at the corresponding exported
`handler`. The core application does not require HubSpot serverless functions
or an Enterprise subscription.

## Connecting the UI extension

Replace the example or development URL in both the HubSpot app manifest and the
three small backend constants under `apps/tidshub-hubspot/src/app/`. The origin
must appear in `permittedUrls.fetch`, and the exact callback URL must appear in
`auth.redirectUrls` and the HubSpot app's OAuth settings.
