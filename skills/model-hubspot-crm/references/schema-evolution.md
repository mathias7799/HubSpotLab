# Schema evolution

## Additive-first migration

1. Add new properties, options, labels, or associations without removing old
   readers.
2. Deploy readers that accept both old and new shapes.
3. Backfill in bounded, resumable batches with rate-limit handling and an audit
   cursor.
4. Compare counts and representative records before switching writers.
5. Switch writers while retaining rollback compatibility.
6. Remove old metadata only after retention and rollback windows expire.

## Invariants

Define machine-testable invariants such as:

- at most one active approval record per user/week;
- exactly one Primary company per guarded deal when the rule requires it;
- every time record has one owner and one date;
- optional task associations never replace the required project/deal/contact;
- app-object unique keys remain unique across retries;
- archived targets are not selected for new relationships.

Recheck mutation-critical invariants immediately before the write, not only when
the form first loads.

## Risky changes

- Changing an enumeration internal value creates a new API value; changing its
  label does not.
- Changing property type may require a replacement property and backfill.
- Association type IDs and availability can vary by definition and installation;
  do not hardcode an observed portal value as a universal constant.
- Pipeline and stage internal IDs are not their labels and can differ by portal.
- Deleting schema metadata may strand records or break installed UI versions.

## Verification

Record before/after counts, failed IDs, retry state, API limits, and sampled
records. Test old and new application versions during the compatibility window.
Keep migration credentials external and never log full record payloads when they
contain customer data.
