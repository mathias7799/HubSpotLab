---
name: build-hubspot-app
description: Plan, scaffold, extend, diagnose, migrate, and release production-oriented HubSpot apps with HubSpotLab SpotKit. Use when Codex needs to create a pure HubSpot or OAuth marketplace project, choose HubSpot components and storage, add webhooks/workflow actions/app objects/app events/agent tools/app functions/SCIM, adopt an existing HubSpot project, troubleshoot SpotKit diagnostics, or prepare a HubSpot app for upload and deployment.
---

# Build a HubSpot app

Use SpotKit as the deterministic execution layer. Keep product decisions in the
project and never reimplement a SpotKit operation ad hoc.

## Establish the boundary

1. Read the repository's `AGENTS.md` and project-local instructions.
2. Inspect the existing project before proposing changes:

   ```bash
   pnpm spotkit inspect <project> --json
   pnpm spotkit doctor <project> --json
   ```

3. For a new app, identify whether it must be:
   - HubSpot-only with no portable backend;
   - an OAuth marketplace app with a small portable backend; or
   - a static private app for HubSpot-hosted functions or SCIM.
4. Read [references/architecture-decisions.md](references/architecture-decisions.md)
   before choosing a profile, feature, persistence model, or hosting target.
5. Preserve explicit constraints such as no serverless, no backend, entitlement
   limits, and at most one app object.

Do not invent a backend for a HubSpot-only request. Do not claim a UI extension
can perform an API operation until the project or official HubSpot validation
proves it.

## Plan from evidence

Produce a plan tied to observable project state. Include:

- user surfaces: app page, record card, settings, workflow, or administration;
- CRM object and association behavior;
- authentication and requested OAuth scopes;
- persistence and tenant-isolation boundaries;
- hosting only when the chosen architecture needs it;
- installation, migration, and rollback behavior;
- tests and release evidence.

Prefer one cohesive app over disconnected examples. Keep one app object as the
hard project maximum even when HubSpot permits more.

## Execute with SpotKit

Use the interactive control center for collaborative work:

```bash
pnpm spotkit ui <project-or-workspace>
```

Use scriptable commands for reproducible changes and CI:

```bash
pnpm spotkit create <slug> --directory projects --name "Display name"
pnpm spotkit add <feature> <project>
pnpm spotkit sync-origin <https-origin> <project> --check
pnpm spotkit doctor <project> --strict
```

Preview before writing when a command supports `--check`. Treat upload, browser
launch, production deployment, npm publication, and CRM-data mutation as
separate externally visible actions requiring explicit authority.

For existing projects, read
[references/adoption-and-upgrades.md](references/adoption-and-upgrades.md)
before adding the lifecycle manifest or merging runtime changes.

## Verify proportionally

Read [references/verification.md](references/verification.md) and run every gate
that applies to the changed surfaces. At minimum:

```bash
pnpm spotkit doctor <project> --strict
pnpm spotkit release-check <project> --hubspot
```

Use authenticated browser testing for HubSpot UI behavior. Use `spotkit smoke`
for a deployed portable API. A generated-project test does not prove an adopted
product works; run the product's own tests and typechecks too.

## Leave an operable project

Update the project README and operational docs with:

- purpose and user workflow;
- prerequisites, scopes, and entitlements;
- local development and validation commands;
- storage, security, and hosting boundaries;
- installation, release, and rollback steps;
- current screenshots when UI changed.

Report what was proved, what still requires operator credentials or deployment,
and which external actions were deliberately not performed.
