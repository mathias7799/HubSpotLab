# TidsHub architecture

TidsHub is a HubSpot-native time registration app with one deliberately small
external boundary. HubSpot renders every product surface. The portable OAuth
API handles only capabilities that are unreliable or unavailable from a UI
extension: OAuth token custody, schema provisioning, custom-object writes, and
CRM associations.

```mermaid
flowchart LR
  UI[HubSpot UI extensions] -->|HubSpot signature v3| API[Portable OAuth API]
  API -->|OAuth access token| CRM[HubSpot CRM APIs]
  CRM --> OBJ[(One TidsHub custom object)]
  UI -->|useAssociations| OBJ
```

## Components

| Component        | Runtime     | Responsibility                                      |
| ---------------- | ----------- | --------------------------------------------------- |
| App page         | HubSpot     | Week overview, navigation, entry form, empty states |
| CRM sidebar card | HubSpot     | Quick entry and association to the current record   |
| Settings page    | HubSpot     | Installation health and idempotent provisioning     |
| OAuth API        | User hosted | Tokens, signatures, schema, records, associations   |
| Token store      | Upstash     | Encrypted, durable installation records             |

The API core uses standard web `Request` and `Response` objects. Thin adapters
translate Node HTTP, AWS Lambda, Azure Functions, or optional HubSpot serverless
events into that contract.

## One-object data model

The schema is named `tidshub_record` for new installations. Provisioning also
recognizes the earlier `tidshub_poster` schema and reuses it. This prevents an
upgrade from creating a second custom object.

The `record_kind` property differentiates records:

- `time_entry`: a user's dated duration, category, description, and billing
  state;
- `week`: reserved for weekly workflow state;
- `norm`: reserved for work schedules and historical norms.

Time entries can be associated with contacts, companies, deals, and tickets.
The app creates association definitions only when they are needed.

## Request trust boundary

Every `/api/*` request must contain HubSpot signature v3 and a timestamp no
older than five minutes. The API reconstructs the public request URL, validates
the HMAC with the OAuth client secret, resolves the portal installation, and
then calls HubSpot with its OAuth access token.

Unsigned requests and the in-memory token store are allowed only for explicit
localhost development. Production startup fails unless durable token storage
is configured.

## Deployment checklist

1. Deploy `apps/tidshub-api` with the required environment variables.
2. Replace the development API origin in the app manifest and extension
   constants.
3. Add the exact OAuth callback URL and permitted fetch origin.
4. Run `pnpm tidshub:validate` and `pnpm tidshub:upload`.
5. Install the OAuth app in a HubSpot test portal.
6. Open settings and confirm `TidsHub er klar`.
7. Test the app page and each enabled CRM record type.
