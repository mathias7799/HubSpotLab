# TidsHub HubSpot app

OAuth UI-extension project for TidsHub. The app page provides a weekly view,
the CRM card works with associated entries, and settings invokes idempotent
backend provisioning.

## Product surfaces

- **App page:** week navigation, totals, day drill-down, low-click CRM search,
  time entry creation/editing/deletion, submission, and approvals.
- **CRM sidebar card:** quick entry associated with the current contact,
  company, deal, or ticket.
- **Settings:** health check and idempotent provisioning of exactly one custom
  object.

Approval officers and week workflow records use the same TidsHub custom object
as time entries. No second custom object or external application database is
required.

The UI is intentionally built only with `@hubspot/ui-extensions`. It ships no
iframe application and requires no separate frontend host.

See the repository's [TidsHub architecture guide](../../docs/tidshub.md) for
the data model, request trust boundary, and deployment sequence.

The extension does not use the experimental API client. All protected writes
go through `apps/tidshub-api`, while supported CRM hooks continue to render
HubSpot-native data.

Before validating or uploading, replace the development origin in the manifest
and source constants with your deployed API origin. Keep the OAuth callback URL
synchronized with the backend's `PUBLIC_URL`.

```bash
pnpm typecheck
pnpm tidshub:validate
pnpm tidshub:upload
```

The project targets HubSpot platform version `2026.03`. The app requires OAuth
scopes for custom-object schemas and records plus read access to supported CRM
record types. Schema writes are performed by the portable OAuth backend because
the UI-extension request proxy does not expose schema creation reliably.
