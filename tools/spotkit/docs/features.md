# SpotKit feature catalog

SpotKit starts with a page, CRM card, native settings, OAuth API, and portable
hosting. Additional features are installed explicitly so apps request only the
capabilities they use.

| HubSpot 2026.03 component | SpotKit status   | Notes                                                     |
| ------------------------- | ---------------- | --------------------------------------------------------- |
| Page                      | Included         | Routed app overview                                       |
| Card                      | Included         | Deal sidebar starter                                      |
| Settings                  | Included         | Signed encrypted configuration UI                         |
| Webhooks                  | Addable          | Verified, batched, retry-safe receiver                    |
| Workflow action           | Addable          | Unpublished secure action starter                         |
| App object                | Gated/addable    | Enforces the one-object project policy                    |
| App object association    | Gated/addable    | Requires the generated app object                         |
| App events                | Gated/addable    | Event definition and authenticated sender                 |
| Agent tool                | Gated/addable    | Verified and idempotent workflow/agent tool               |
| App function              | Private-app only | HubSpot-hosted functions are deliberately not required    |
| SCIM                      | Private-app only | Not compatible with the default OAuth marketplace profile |

The catalog reflects HubSpot's official `2026.03` project-component templates.
Run `spotkit features` for the machine-shipped status and `spotkit add` for an
addable component.

## Webhooks

Subscriptions start inactive. Implement and test the generated event handler,
then activate only the event types the product needs. The receiver verifies the
raw request before parsing and uses an atomic seven-day claim. A failed handler
releases its claim so HubSpot can retry it.

## Workflow actions

Actions start with `isPublished: false`. Customize fields, labels, output fields,
supported object types, and domain logic before publication. Callback IDs are
deduplicated for seven days and failures remain retryable.

## Gated marketplace components

App objects and app events require HubSpot approval. SpotKit generates exactly
one compact app object, validates its primary property, and prevents an
association from being added first. App events include a tested helper for
`/events/v3/send`; use the fully qualified event name assigned after upload.

Agent tools support both `WORKFLOWS` and `AGENTS` and remain unpublished until
explicitly enabled. Treat every model-supplied input as untrusted and require
human confirmation before destructive or externally visible actions.
