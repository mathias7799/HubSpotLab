# Automation surface selection

| Need                                                         | Preferred surface         | Important constraint                                               |
| ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------ |
| React to subscribed CRM changes delivered by HubSpot         | Webhook                   | At-least-once, signed batches, subscription approval/configuration |
| Let admins place an app operation inside a HubSpot workflow  | Workflow custom action    | Explicit input/output contract; keep unpublished until tested      |
| Publish an app-owned event into HubSpot timelines/automation | App event                 | Gated component; authenticated sender and stable event schema      |
| Let HubSpot agents invoke a bounded app capability           | Agent tool                | Treat generated input as untrusted; gated and unpublished first    |
| Expose a small HubSpot-hosted endpoint or private operation  | Private app function      | Private-static profile; optional and entitlement-dependent         |
| Run a scheduled or long-running external job                 | Portable worker/scheduler | Not a synchronous workflow handler; persist progress and resume    |

## Avoid surface mismatch

- Do not poll the CRM when a reliable subscribed event exists, unless recovery
  reconciliation requires it.
- Do not use a webhook response to perform work that exceeds HubSpot's delivery
  timeout; acknowledge only after durable acceptance.
- Do not expose a broad “run arbitrary CRM operation” agent tool. Model distinct
  least-privilege capabilities.
- Do not require private app functions to make an OAuth marketplace app work.
- Do not publish an app event that merely duplicates a standard CRM property
  change without a product reason.

## Contract questions

- Who configures or invokes the automation?
- What record and portal establish authorization context?
- Which inputs are selected at configuration time versus runtime?
- Which outputs feed later workflow branches?
- Can the operation finish synchronously?
- How should a user understand terminal versus retryable failure?
- What happens if the app is uninstalled, scopes change, or the record archives?
