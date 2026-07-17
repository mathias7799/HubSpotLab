# Diagnostic runbook

## Source and build

- Confirm the deployed commit, HubSpot build ID, app version, platform version,
  feature metadata, and API artifact match the intended release.
- Check stable callback/permitted/feature origins and reject placeholder or
  temporary tunnel origins in production.
- Run strict doctor and compare lifecycle/runtime drift before blaming the
  portal.

## Hosting and dependencies

- Check DNS/TLS, process/container/function health, region, recent restarts,
  timeout/limit changes, and dependency availability.
- Verify required environment variable names and paired storage credentials
  without printing their values.
- Distinguish `/health` success from durable storage, HubSpot API, and external
  dependency success when health is intentionally shallow.
- Correlate latency and failures by portal, route, handler version, and provider
  delivery identity.

## OAuth and installation

- Verify callback origin/path, state-cookie security, authorization code timing,
  requested versus granted scopes, installation portal, refresh outcome, and
  revocation/uninstall state.
- Confirm the UI request is bound to verified HubSpot context and selects the
  same portal installation.
- Treat 401 (invalid/expired authentication), 403 (scope/permission/entitlement),
  404 (wrong object/route/installation), and 429 (rate limit) separately.
- Reconnect only after the required scope or installation defect is identified.

## Components and portal state

- Confirm the expected HubSpot build is deployed and the component is enabled,
  installed, and placed in the relevant record layout.
- Verify gated component approval and account entitlement separately from
  `hs project validate`.
- Inspect object schemas, association definitions/labels, pipelines/stages,
  workflow publication/enrollment, webhook subscription activation, and archived
  records using authoritative portal identifiers.
- For app/custom objects, distinguish schema discovery, schema creation, record
  authorization, association authorization, and account entitlement.

## Storage and tenant isolation

- Verify durable token/configuration/idempotency storage availability, namespace,
  encryption key version, and portal keying without reading plaintext secrets.
- Check whether a fallback mode was selected and whether it is permitted in
  production.
- Never clear a stuck idempotency key before proving the original attempt failed
  and understanding whether its side effects completed.
