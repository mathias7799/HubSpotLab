# Security and platform review

## Authentication and tenant boundaries

- Bind OAuth state to a secure, HttpOnly, SameSite cookie and reject replay,
  expiry, portal mismatch, and unsafe return targets.
- Keep client secrets, refresh tokens, access tokens, and private keys out of UI
  extensions, logs, URLs, screenshots, source, and error bodies.
- Refresh tokens with concurrency control and preserve a valid installation when
  a concurrent refresh succeeds.
- Key installations and configuration by portal plus application namespace.
- Verify every portal-scoped API request uses the installation selected from
  authenticated context, not a caller-controlled portal ID alone.

## Requests and asynchronous delivery

- Verify HubSpot signature v3 over the exact method, URI, timestamp, and raw
  body. Enforce timestamp tolerance and constant-time comparison.
- Treat webhook and workflow retries as normal. Claim idempotency atomically,
  acknowledge completed duplicates, and release failed claims for retry.
- Validate body size, content type, JSON shape, supported event/action type, and
  authorization before side effects.
- Bound external calls with timeouts and return retry-compatible status codes.

## Persistence and secrets

- Require durable production token storage. Memory storage and unsigned request
  bypasses must be localhost-only.
- Encrypt sensitive values with authenticated encryption, tenant-bound
  associated data, and versioned key derivation. Never use a static IV.
- Require paired storage credentials and fail closed on partial configuration.
- Avoid storing OAuth installations only in a HubSpot object because a token is
  required to access that object.
- Enforce the project maximum of one app object and check Enterprise/gated
  entitlements before promising object creation.

## Scopes, metadata, and entitlements

- Compare runtime operations with required, optional, and conditionally required
  OAuth scopes. Prefer the narrowest scopes that keep installation functional.
- Verify profile compatibility: marketplace OAuth versus private static.
- Check callback, permitted fetch, webhook, workflow, and agent-tool origins for
  HTTPS alignment and reject example or temporary origins before release.
- Treat `hs project validate` as metadata validation, not proof of approval,
  installation, account entitlement, UI placement, or runtime authorization.
- Keep app functions optional; do not introduce an Enterprise-only serverless
  requirement into a marketplace app.

## CRM and mutation safety

- Validate object IDs, property names, pipeline/stage IDs, association types,
  labels, and archived states against the target portal.
- Distinguish standard objects, custom objects, app objects, projects, tasks,
  tickets, and activities rather than assuming identical API behavior.
- Fetch task candidates through actual associations and make closed-task
  inclusion explicit.
- Recheck invariants immediately before guarded mutations such as deal-stage
  changes or approval decisions.
- Make partial failures observable and avoid reporting success when only some
  associations or writes completed.

## Hosting and operations

- Ensure production builds execute compiled artifacts as non-root where
  applicable and exclude `.env`, source credentials, and dependency trees.
- Verify health checks do not expose secrets and reflect required dependencies.
- Review rate-limit handling, backoff, timeouts, structured logs, correlation
  IDs, and deletion/retention behavior.
- Confirm release checks, rollback steps, and operator-owned secrets are
  documented for every supported hosting target.
