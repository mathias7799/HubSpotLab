# CloseReady production review

Review date: 2026-07-17

## Resolved in source

- OAuth rejects unsafe external/protocol-relative return paths, validates signed
  state shape/time, coalesces concurrent portal refreshes, and clears the state
  cookie after callback.
- The installed confirmation page now sends CSP, no-store, no-referrer, and
  nosniff headers.
- Regression tests cover malicious return paths, refresh concurrency, and
  installed-page headers.
- Rule provisioning and mutations now require a portal-scoped CloseReady
  administrator. Guarded stage changes require either an administrator or an
  explicitly configured transition user. Production denies both capabilities
  by default, and tests cover portal policy resolution and missing identity.

## Release blockers

1. `closeready.example.com` is intentionally a reserved placeholder. Strict
   diagnostics and release checks fail until every callback, permitted fetch URL,
   UI backend constant, and API environment uses the real stable HTTPS origin.
2. Configure `CLOSEREADY_AUTHORIZATION_POLICY` with real portal/user IDs and
   verify administrator and transitioner behavior in the test portal. CloseReady
   deliberately enforces this explicit app policy because OAuth writes do not
   inherit the acting user's native HubSpot CRM permissions.
3. Authenticated test-portal verification remains required for rule storage
   fallback, labeled associations, deal permissions, stage transitions, and
   empty/error/loading states after final deployment.

## Evidence boundary

HubSpot metadata validation does not prove custom-object entitlement, gated
capability approval, record-layout placement, optional scope grant, or installed
runtime behavior. Keep the release blocked until those results are recorded.
