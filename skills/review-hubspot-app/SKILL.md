---
name: review-hubspot-app
description: Audit an existing HubSpot app for correctness, security, tenant isolation, scopes, entitlements, CRM modeling, UI/UX, operational readiness, and release risk. Use when Codex is asked to review a HubSpot project, perform a production or marketplace readiness assessment, investigate whether an app is safe to deploy, examine a pull request or migration, prioritize technical debt, or verify that SpotKit and HubSpot validation evidence actually covers the claimed behavior.
---

# Review a HubSpot app

Perform a read-only, evidence-first audit. Report findings before summaries. Do
not silently fix issues unless the user separately asks for implementation.

## Establish the review target

1. Read `AGENTS.md`, project instructions, product docs, and current git status.
2. Identify the claimed product workflow, deployment profile, HubSpot account
   prerequisites, and changed files or review boundary.
3. Inventory the project when SpotKit is available:

   ```bash
   pnpm spotkit inspect <project> --json
   pnpm spotkit doctor <project> --json
   pnpm spotkit upgrade <project> --json
   ```

4. Treat generated code, tests, manifests, screenshots, and green CI as evidence
   only for the behavior they actually cover.
5. Use structural code navigation for definitions, callers, and impact. Use
   literal search for configuration values, strings, and secret patterns.

If the deployed app or authenticated HubSpot account is unavailable, state that
runtime behavior remains unverified rather than inferring success from source.

## Review by risk

Read [references/security-and-platform.md](references/security-and-platform.md)
for OAuth, request security, storage, entitlements, metadata, CRM, and hosting
checks. Read [references/product-and-ux.md](references/product-and-ux.md) when
the app has user-facing pages, cards, settings, approvals, or configuration.

Trace critical workflows end to end:

- installation → OAuth callback → token custody → portal lookup;
- HubSpot UI action → signed API boundary → authorization → CRM mutation;
- webhook/workflow delivery → validation → idempotency → retry outcome;
- configuration write → tenant isolation → read/evaluation → failure behavior;
- release metadata → upload → deployment → smoke and rollback evidence.

Look for missing states and negative paths, not only happy-path implementations.
Verify the one-app-object maximum and distinguish gated-feature approval from
metadata validity.

## Run proportionate evidence

Prefer existing project commands. Typical gates are:

```bash
pnpm --dir <project> test
pnpm --dir <project> typecheck
pnpm spotkit doctor <project> --strict
pnpm spotkit release-check <project> --hubspot
```

Do not upload, deploy, open OAuth, publish a package, or mutate CRM data during a
review without explicit authority. Browser inspection may verify rendered and
authenticated behavior; keep test data and external side effects in scope.

## Write actionable findings

Use [references/reporting.md](references/reporting.md) for severity and report
shape. Every finding must include:

- concrete evidence with a file/line, command output, or reproduced behavior;
- user, security, operational, or marketplace impact;
- the condition that triggers the issue;
- a scoped remediation direction;
- verification needed after remediation.

Separate proven defects from questions and residual risks. Avoid generic advice
that is not tied to the reviewed app. If no findings remain, say what was tested
and list the unverified production/account/browser boundaries.
