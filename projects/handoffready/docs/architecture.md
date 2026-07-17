# HandoffReady architecture

```mermaid
flowchart LR
  Page[HubSpot app page] --> API[Portable API]
  Card[HubSpot CRM card] --> API
  Settings[HubSpot settings] --> API
  API --> Runtime[SpotKit OAuth runtime]
  Runtime --> Store[(Encrypted token store)]
  Runtime --> HubSpot[HubSpot CRM APIs]
  API --> Config[(Encrypted handoff settings)]
  HubSpot --> Deal[Deals and associations]
  HubSpot --> Ticket[Service tickets]
```

HubSpot renders the product UI. The portable API owns secrets, OAuth tokens,
request verification, and operations unavailable to UI extensions. Keep domain
logic independent from the Node adapter so other HTTP runtimes can wrap it.

HandoffReady intentionally uses no custom object. Readiness is derived from live
deal properties and associations. Completion is represented by an associated
HubSpot ticket carrying a stable HandoffReady subject marker; unrelated tickets
are ignored. Ticket creation rechecks the closed-won state, shares an atomic
portal/deal claim across the card and workflow, and treats creation plus
association as one logical operation. A failed association triggers
compensating ticket deletion.
