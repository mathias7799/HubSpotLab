---
name: operate-hubspot-app
description: Deploy, install, diagnose, monitor, recover, and safely operate HubSpot applications across test and production portals. Use when Codex must investigate installation or OAuth health, inspect portal-specific failures, prepare or verify a release, run smoke checks, diagnose webhooks/workflows/storage/hosting, respond to an incident, plan rollback, collect support evidence, or hand an app to operators without exposing credentials or customer data.
---

# Operate a HubSpot app

Work from current external state and preserve a timestamped evidence trail. Keep
diagnosis read-only until the user authorizes a specific mutation, upload,
deployment, reconnect, rollback, or CRM-data change.

## Establish operational context

Capture:

- application, version/build, commit, environment, hosting target, and region;
- HubSpot portal/account ID and whether it is test or production;
- installation time, OAuth scopes, app profile, and relevant entitlements;
- incident start, affected users/workflows/objects, and current impact;
- last known good build and recent configuration or secret changes;
- available logs, correlation IDs, delivery IDs, and health checks.

Never place tokens, cookies, client secrets, private keys, raw CRM records, or
customer payloads in tickets, screenshots, commands, or reports.

## Triage without changing state

Start with repository and SpotKit evidence:

```bash
pnpm spotkit inventory <workspace>
pnpm spotkit inspect <project> --json
pnpm spotkit doctor <project> --json
pnpm spotkit upgrade <project> --json
```

Read [references/diagnostic-runbook.md](references/diagnostic-runbook.md) and
separate these layers:

1. source/build metadata;
2. deployed API/hosting health;
3. OAuth installation and scopes;
4. HubSpot UI/component installation and placement;
5. portal objects, associations, workflows, webhooks, and entitlements;
6. external storage or dependencies.

Do not reinstall an app as a generic first step. Reinstallation can change
authorization state and erase useful evidence without fixing metadata,
entitlement, origin, storage, or runtime defects.

## Prepare and verify releases

Read [references/release-and-rollback.md](references/release-and-rollback.md).
Typical pre-release evidence is:

```bash
pnpm spotkit release-check <project> --hubspot
pnpm spotkit upload <project> --confirm --message "Release candidate"
```

Upload creates a HubSpot build and does not deploy it. Record the build ID,
review it, deploy separately with explicit authority, then run:

```bash
pnpm spotkit smoke https://api.example.com
```

Complete authenticated test-portal checks for app pages, cards, settings,
associations, automations, permissions, tenant isolation, and failure states.

## Respond to incidents

Read [references/incident-response.md](references/incident-response.md). Prefer
the least destructive mitigation that stops impact while preserving evidence:

- pause publication, subscription, workflow, or affected operation;
- reduce traffic/concurrency or disable one failing integration path;
- roll back to the recorded last known good build;
- rotate a credential only when exposure or invalidation is evidenced;
- reconcile missed/duplicated work from durable delivery identities.

Never delete CRM records, clear production storage, rotate secrets, revoke an
installation, or deploy a rollback merely because it might help. State the
impact and request authority for the exact action.

## Close with proof

Report timeline, scope, root cause or current hypothesis, evidence, mitigation,
recovery validation, residual risk, and follow-up owner. Distinguish source
verification from deployed/account verification. A green health endpoint does
not prove OAuth, CRM writes, UI rendering, or webhook delivery.

Update runbooks after the incident or release so the next operator can reproduce
the diagnosis without private context.
