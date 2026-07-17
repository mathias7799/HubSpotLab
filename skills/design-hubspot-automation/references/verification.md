# Automation verification

## Handler tests

Test:

- valid signed request;
- invalid signature and expired timestamp;
- malformed JSON, oversized body, and wrong content type;
- unsupported object/event/action type;
- missing required and invalid optional inputs;
- first delivery, sequential duplicate, and concurrent duplicate;
- failure followed by successful retry;
- out-of-order or delayed events;
- missing scope, archived record, and association mismatch;
- HubSpot 429/5xx and external timeout;
- partial write and resumable/compensating behavior;
- redaction of logs and error responses.

## Metadata and project gates

```bash
pnpm spotkit doctor <project> --strict
pnpm spotkit release-check <project> --hubspot
```

Confirm callback/action URLs use the stable permitted HTTPS origin. Verify
supported clients, object types, input/output fields, publication flag, webhook
concurrency, and subscription activation explicitly.

## HubSpot test account

1. Upload a release candidate without deploying automatically.
2. Install or update it in a non-production test account.
3. Configure the workflow/action/tool as an administrator would.
4. Exercise success and visible terminal failure.
5. Trigger or replay a duplicate and prove side effects occur once.
6. Remove a scope or archive a record and verify actionable failure.
7. Inspect logs using correlation/delivery identity without exposing CRM data.
8. Publish only after the installed version and rollback path are recorded.

Official metadata validation does not prove delivery, publication, agent-tool
approval, workflow enrollment, or retry behavior.
