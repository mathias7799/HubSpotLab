---
name: design-hubspot-automation
description: Design, implement, and review reliable HubSpot automation using webhooks, workflow custom actions, app events, agent tools, CRM mutations, and optional private app functions. Use when Codex must choose an automation surface, define inputs/outputs and enrollment behavior, handle HubSpot retries and rate limits, make side effects idempotent, publish an action safely, connect AI agents to HubSpot operations, or troubleshoot duplicated, delayed, unauthorized, or partially completed automation.
---

# Design HubSpot automation

Choose the smallest HubSpot automation surface that matches who initiates work,
when it must run, and what outcome the user needs. Design delivery and failure
semantics before writing handlers.

## Define the automation contract

Capture:

- initiating actor or event;
- supported CRM object types and enrollment context;
- required inputs, optional inputs, and defaults;
- CRM reads, writes, associations, and external calls;
- synchronous response or asynchronous completion expectation;
- user-visible outputs and error explanation;
- maximum useful latency and retry window;
- deduplication identity and desired repeated-request behavior;
- scopes, secrets, entitlements, and approval gates.

Read [references/surface-selection.md](references/surface-selection.md) before
choosing webhooks, workflow actions, app events, agent tools, or app functions.

## Design for at-least-once delivery

Assume webhook, workflow, queue, and client retries can deliver the same logical
request more than once. Read
[references/reliability-and-limits.md](references/reliability-and-limits.md) and
define:

1. a canonical event/action identity;
2. an atomic idempotency claim;
3. completed-duplicate behavior;
4. in-progress duplicate behavior;
5. claim release or expiry after failure;
6. side-effect ordering and compensation;
7. timeout, rate-limit, and backoff behavior.

Do not mark work complete before every required side effect is durable. Do not
hold a completed claim after a failure that HubSpot should retry.

## Implement with explicit boundaries

When SpotKit fits the project:

```bash
pnpm spotkit add webhooks <project>
pnpm spotkit add workflow-action <project>
pnpm spotkit add agent-tool <project>
pnpm spotkit add app-event <project>
```

Keep generated actions unpublished until their contract and negative paths pass.
Verify HubSpot signature v3 before parsing or mutating. Validate object types,
record IDs, properties, association definitions, and input size. Keep secrets and
OAuth tokens outside workflow fields, event properties, agent responses, and
logs.

For agent tools, design one narrow capability with explicit inputs and a bounded
result. Treat model-generated arguments as untrusted. Require both AGENTS and
WORKFLOWS clients only when the metadata and behavior support both.

## Make outcomes operable

Emit structured, tenant-scoped logs with a correlation ID, delivery identity,
handler version, attempt, duration, and redacted outcome. Distinguish:

- accepted and completed;
- completed duplicate;
- retryable dependency failure;
- terminal invalid input or permission failure;
- partial side effect requiring investigation.

Never log raw authorization headers, signatures, tokens, customer payloads, or
agent prompts containing CRM data.

## Verify before publication

Read [references/verification.md](references/verification.md). Test duplicate,
concurrent, out-of-order, delayed, malformed, unauthorized, rate-limited, and
partially failing deliveries. Validate official metadata, then verify the
installed automation in a non-production HubSpot account.

Return the chosen surface and rejected alternatives, contract, sequence,
idempotency strategy, scopes, failure matrix, observability, tests, publication
plan, and residual HubSpot approval or entitlement requirements.
