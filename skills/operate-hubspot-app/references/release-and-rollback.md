# Release and rollback

## Release evidence

Record:

- source commit and clean worktree;
- package/app version and lifecycle manifest;
- test, typecheck, lint, format, doctor, official validator, and secret-scan
  results;
- built artifact digest or image identifier;
- HubSpot build ID and target test portal;
- configuration/secret names changed, never their values;
- database/object/schema migration sequence;
- smoke and authenticated browser results;
- rollback artifact and operator.

## Promotion sequence

1. Validate and build immutable artifacts.
2. Create a HubSpot release-candidate build without deploying it.
3. Deploy API/worker changes in backward-compatible order.
4. Apply additive metadata/schema changes.
5. Deploy the HubSpot build to a test portal.
6. Run public smoke and authenticated product tests.
7. Promote deliberately and watch error, latency, OAuth, delivery, and CRM-write
   indicators.
8. Keep the previous compatible artifact available through the rollback window.

## Rollback decision

Rollback when impact is material and the last known good version remains
compatible with current schema/configuration. Prefer forward mitigation when a
rollback would corrupt new data, lose required scopes, or depend on removed
metadata.

Before rollback, identify:

- affected surfaces and stop condition;
- last known good HubSpot build and API artifact;
- schema/config compatibility;
- queued/retrying webhook or workflow deliveries;
- writes requiring reconciliation;
- verification and owner after rollback.

Rollback is an external production mutation. Explain the consequences and obtain
explicit authority before executing it.
