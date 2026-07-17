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
| App object                | Planned          | Will preserve the one-object project policy               |
| App object association    | Planned          | Depends on the app-object recipe                          |
| App events                | Planned          | Event definitions and send helper                         |
| Agent tool                | Planned/gated    | Requires HubSpot account feature access                   |
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
