# Reliability, retries, and limits

## Idempotency

Derive keys from stable provider identity plus tenant and handler namespace. Do
not use the raw body alone when semantically identical retries can vary in
serialization, and do not use only a CRM record ID when multiple legitimate
events can affect that record.

Use an atomic store operation. A process-local set is insufficient across
instances or restarts. Store a bounded digest and status rather than sensitive
payloads. Define retention from the provider retry window plus operational
reconciliation needs.

## Side-effect ordering

1. Verify authentication and timestamp.
2. Validate the full input contract.
3. Claim idempotency.
4. Read current CRM state and recheck invariants.
5. Perform the minimum required writes in a deterministic order.
6. Persist completion evidence.
7. Return the provider-compatible outcome.

When multiple writes cannot be transactional, record progress or design safe
upserts so a retry can resume. Surface partial completion; do not convert it to a
generic success.

## Rate limits and dependencies

- Bound concurrency per portal and globally.
- Honor HubSpot retry/rate-limit headers when available and use jittered backoff.
- Separate retry budgets for HubSpot and external dependencies.
- Use timeouts and cancellation for every network call.
- Cache metadata carefully; pipeline, property, owner, and association definitions
  can change per portal.
- Reconcile missed events with a cursor-based job when the product cannot tolerate
  gaps.

## Failure classification

| Failure                                          | Typical outcome                                       |
| ------------------------------------------------ | ----------------------------------------------------- |
| Invalid signature, stale timestamp, wrong portal | Reject; do not retry internally                       |
| Unsupported event/action or malformed input      | Terminal validation result                            |
| Missing scope or archived/inaccessible record    | Terminal until configuration changes; explain clearly |
| HubSpot 429 or transient 5xx                     | Retry with bounded backoff                            |
| External dependency timeout                      | Retry if the operation remains idempotent             |
| Partial side effects                             | Resume/compensate from durable progress; alert        |
| Completed duplicate                              | Acknowledge without repeating effects                 |
