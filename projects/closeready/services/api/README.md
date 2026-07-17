# CloseReady API

This package contains the HubSpot gateway and a web-standard `Request` to
`Response` handler. A Node adapter is included. AWS Lambda, Azure Functions, or
other HTTP runtimes can use thin adapters around the same handler; those
adapters are not currently shipped in this project.

Implemented capabilities:

- create or locate the single `closeready_rule` custom object where available;
- fall back to encrypted portable rule storage on non-Enterprise portals;
- discover deal pipelines and deal/contact/company properties;
- discover HubSpot deal-to-contact and deal-to-company association labels;
- create, list, update, and archive rules;
- collect current deal, association, and metric data;
- evaluate a proposed stage transition;
- update the deal stage only after a guarded evaluation passes.

OAuth, AES-256-GCM encrypted Upstash token persistence, HubSpot signature v3
verification, and a local Node adapter are included. The core HTTP handler still
injects these boundaries so cloud-specific adapters remain small.

OAuth return paths are restricted to local absolute paths, concurrent refreshes
for one portal are coalesced, the state cookie is cleared after callback, and the
installed page uses a locked-down CSP and no-store headers.

## Local development

```bash
pnpm --dir projects/closeready/services/api dev:local
curl http://localhost:8788/health
```

The local command uses in-memory token and rule stores and accepts unsigned
requests only on `localhost`/`127.0.0.1`. A durable encrypted store is mandatory
outside development. For a real OAuth flow, copy `.env.example`, configure the
credentials and public HTTPS origin, run `pnpm --filter
@hubspotlab/closeready-api dev`, then open `{PUBLIC_URL}/oauth/install`.

## Production configuration

| Variable                          | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `HUBSPOT_CLIENT_ID`               | OAuth app client ID                        |
| `HUBSPOT_CLIENT_SECRET`           | OAuth and HubSpot request-signature secret |
| `HUBSPOT_SCOPES`                  | Space- or comma-separated scope override   |
| `PUBLIC_URL`                      | Public API origin without a trailing slash |
| `TOKEN_ENCRYPTION_KEY`            | Encrypts durable OAuth and rule records    |
| `UPSTASH_REDIS_REST_URL`          | Durable REST Redis endpoint                |
| `UPSTASH_REDIS_REST_TOKEN`        | REST Redis bearer token                    |
| `RULE_STORAGE`                    | `auto`, `hubspot`, or `external`           |
| `CLOSEREADY_AUTHORIZATION_POLICY` | Portal-scoped mutation allowlists          |

Production startup requires encrypted durable token storage.

Rule and schema mutations are denied unless the signed HubSpot `userId` appears
in that portal's `administrators` list. Guarded transitions allow administrators
and users in `transitioners`. For example:

```dotenv
CLOSEREADY_AUTHORIZATION_POLICY={"148692618":{"administrators":["12345"],"transitioners":["67890"]}}
```

This is an explicit CloseReady policy. OAuth API calls run as the installed app
and do not inherit the acting user's native HubSpot record permissions.

## Routes

| Method   | Route                                  | Purpose                                       |
| -------- | -------------------------------------- | --------------------------------------------- |
| `GET`    | `/health`                              | Process health                                |
| `GET`    | `/oauth/install`                       | Begin OAuth installation                      |
| `GET`    | `/oauth/callback`                      | Exchange and store OAuth tokens               |
| `POST`   | `/api/provision?portalId=…`            | Select or initialize rule storage             |
| `GET`    | `/api/authorization?portalId=…`        | Current user's app capabilities               |
| `GET`    | `/api/catalog?portalId=…`              | Pipelines, properties, and association labels |
| `GET`    | `/api/rules?portalId=…`                | List rules, optionally by pipeline            |
| `POST`   | `/api/rules?portalId=…`                | Create a rule                                 |
| `PATCH`  | `/api/rules/:id?portalId=…`            | Update a rule                                 |
| `DELETE` | `/api/rules/:id?portalId=…`            | Delete a rule                                 |
| `GET`    | `/api/deals/:id/context?portalId=…`    | Current pipeline and stage                    |
| `POST`   | `/api/deals/:id/evaluate?portalId=…`   | Evaluate a target stage                       |
| `POST`   | `/api/deals/:id/transition?portalId=…` | Re-evaluate and perform a guarded move        |

With `RULE_STORAGE=auto` (the default), CloseReady uses the same idempotent
provisioning model as TidsHub. A setup check lists the portal's custom schemas,
attempts to create `closeready_rule` when absent, and reuses it on later calls.
The provisioner never creates a second custom object. When HubSpot returns an
entitlement or schema-scope error, CloseReady transparently stores rules in the
encrypted Upstash store instead. `RULE_STORAGE=hubspot` makes the custom object
mandatory; `RULE_STORAGE=external` skips schema provisioning entirely.

Custom objects are an Enterprise HubSpot feature, and marketplace OAuth does
not receive schema-write access on every eligible portal. Enterprise admins can
use the checked-in
`schema/closeready-rule.schema.json` with `hs custom-object create-schema` for
the one-time portal bootstrap. Standard portals need no bootstrap and use the
portable store automatically.

Some portals expose manual custom-object creation while withholding schema-write
API permissions. In that case, create `closeready_rule` with `rule_name` as its
primary property. The API detects the minimal schema and stores the complete
validated rule as compact JSON in `rule_name`, avoiding a long manual property
setup.

The default OAuth scope set is intentionally universal. To opt an Enterprise
installation into native rule storage, add `crm.schemas.custom.read`,
`crm.objects.custom.read`, and `crm.objects.custom.write` to `HUBSPOT_SCOPES`;
the app declares these as optional scopes so Standard installations remain
valid.
