# HandoffReady production review

Review date: 2026-07-18

## Resolved in source

- The card and workflow action recheck that the deal is closed won before
  ticket creation. An open deal cannot pass handoff prerequisites.
- Handoff completion uses an encrypted deal-to-ticket identity entry and
  verifies the live HubSpot association. Ticket renames do not create duplicate
  handoffs; the stable subject marker remains a repair path for older entries.
- Ticket creation and association use compensating deletion, and a failed
  cleanup returns the created ticket ID for manual recovery.
- Card and workflow mutations share an atomic portal/deal claim, preventing a
  concurrent double-create while keeping failed attempts retryable.
- Required properties, ticket pipelines, and ticket stages come from live
  HubSpot catalogs. The API rejects stale or mismatched configuration.
- Production settings and ticket writes use a signed, portal-scoped,
  default-deny application policy.
- Overview CRM work uses bounded concurrency; outbound HubSpot calls have a
  ten-second timeout; Node adapters reject bodies larger than 1 MiB.
- Settings, webhook, and workflow JSON endpoints reject unsupported content
  types after request-signature verification.
- The app overview names the next action and excludes the not-yet-created ticket
  from its count of missing sales prerequisites.
- Source tests cover closed-won enforcement, unrelated tickets, compensation,
  concurrent mutation rejection, authorization, catalog validation, overview
  status semantics, OAuth/runtime boundaries, webhooks, and workflow retries.

## Release blockers

1. Replace `handoffready.example.com` with an operator-owned HTTPS origin across
   callbacks, permitted fetch URLs, UI constants, webhooks, workflow actions,
   API environment, and documentation.
2. Configure durable encrypted production storage and
   `HANDOFFREADY_AUTHORIZATION_POLICY` with real portal/user IDs. Verify both
   administrator, ticket-creator, and read-only roles.
3. Install the OAuth app in an authenticated test portal and verify settings,
   property labels, ticket pipelines, open and closed-won deals, company/contact
   associations, ticket creation, ticket links, permission failures, and all
   loading/empty/error states.
4. Exercise the unpublished workflow action in a test workflow, including a
   HubSpot retry and a concurrent card/action attempt. Keep it unpublished until
   those outputs are recorded.
5. Keep deal webhook subscriptions inactive until signed batch, duplicate,
   retry, logging, and production timeout behavior are observed after deployment.
6. Capture reviewed screenshots, refresh the deterministic gallery, and record
   the HubSpot build/account evidence before release promotion.

## Residual risks

- OAuth writes run as the installed application and do not inherit the acting
  user's native HubSpot CRM permissions. HandoffReady deliberately uses its
  explicit application policy; operators must keep that allowlist current.
- Deleting both the encrypted ticket identity entry and the subject marker would
  remove both discovery paths. Normal ticket renames are safe; operators should
  restore configuration storage from backup rather than clearing individual
  identity entries.
- Source and metadata validation cannot prove marketplace approval, portal
  entitlement, record-layout placement, workflow publication, production
  storage credentials, or final host behavior.
