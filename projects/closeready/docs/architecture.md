# CloseReady architecture

```mermaid
flowchart LR
  Card[Deal record card] -->|HubSpot signature v3| API[Portable OAuth API]
  Page[App page and settings] -->|HubSpot signature v3| API
  API --> Pipelines[HubSpot pipelines and properties]
  API --> Deals[Deals and associations]
  API --> Engine[Shared rule engine]
  API --> Choice{Custom objects available?}
  Choice -->|Yes| Rules[(One CloseReady rule object)]
  Choice -->|No| Portable[(Encrypted portable rule store)]
  API --> Tokens[(Encrypted OAuth token store)]
```

## Capability-based persistence

On Enterprise portals, CloseReady stores one record per configured rule in the
single `closeready_rule` custom object. Pipeline and stage IDs partition the
records. On portals without custom-object access, the same validated rule model
is encrypted in the portable Upstash store. The selected mode is cached per
portal after provisioning.

The app never creates a second custom object and never stores readiness
snapshots; it evaluates current HubSpot data on demand. OAuth installations are
always encrypted in the portable token store because credentials must never be
written to CRM.

## API contract

| Method   | Route                       | Purpose                                       |
| -------- | --------------------------- | --------------------------------------------- |
| `POST`   | `/api/provision`            | Select and report the portal's storage mode   |
| `GET`    | `/api/catalog`              | Pipelines, CRM properties, association labels |
| `GET`    | `/api/rules?pipelineId=…`   | List pipeline rules                           |
| `POST`   | `/api/rules`                | Create a validated rule                       |
| `PATCH`  | `/api/rules/:id`            | Update a validated rule                       |
| `DELETE` | `/api/rules/:id`            | Archive a rule                                |
| `POST`   | `/api/deals/:id/evaluate`   | Evaluate against a target stage               |
| `POST`   | `/api/deals/:id/transition` | Guard and perform an allowed transition       |
| `GET`    | `/api/deals/:id/context`    | Read the deal's current pipeline and stage    |

Every production `/api/*` request uses HubSpot signature v3. Explicit localhost
development may accept unsigned requests. The service rechecks rules and current
deal facts during a guarded transition; it never trusts readiness results
supplied by the UI.

## Snapshot collection

The API reads only the properties referenced by applicable rules and builds a
structured snapshot consumed by the shared engine:

- arbitrary deal properties;
- associated contacts and companies, including their deal-association labels;
- arbitrary properties on those associated records;
- line-item, approved-quote, and open-task counts.

Rules select this data explicitly. Associated-record property rules may require
at least one (`any`) or every (`all`) matching record, optionally filtered to a
label such as `Decision maker`.
