# Incident response

## Severity and control

- **Critical:** active cross-tenant access, credential disclosure, uncontrolled
  destructive mutation, or broad outage of a critical workflow.
- **High:** core workflow unavailable or corrupting data for multiple customers.
- **Medium:** significant degraded behavior with a practical workaround or
  limited portal scope.
- **Low:** localized error, documentation/support gap, or non-critical delay.

Declare current impact and confidence. Do not wait for root cause before stopping
active high-severity harm.

## Timeline

Use UTC timestamps for detection, first impact, changes, evidence, mitigation,
recovery, and follow-up. Record command names and redacted outcomes, not secret
values or full customer payloads.

## Common mitigations

- Pause a specific workflow action or webhook subscription rather than uninstalling
  the whole app.
- Disable one unsafe mutation path while preserving read-only UI.
- Reduce concurrency when rate limits or dependency saturation amplify failure.
- Roll back only when artifact and schema compatibility are known.
- Rotate credentials only for evidenced exposure, expiry, or revocation.
- Use delivery/idempotency records to reconcile duplicates or gaps after service
  recovery.

## Recovery proof

Prove more than “health is green”:

- OAuth installation lookup and refresh;
- representative authorized CRM read and bounded write in a test context;
- affected UI surface in HubSpot;
- webhook/workflow delivery and duplicate behavior;
- storage durability and tenant separation;
- error/latency indicators stable through a meaningful observation window.

## Follow-up

Capture root cause, contributing conditions, detection gap, customer impact,
corrective work, tests/alerts/runbook changes, owner, and deadline. Keep uncertain
hypotheses labeled as such.
