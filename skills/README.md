# HubSpotLab agent skills

Agent skills make HubSpotLab's architecture, safety rules, and release evidence
available to AI coding agents without duplicating implementation logic. Skills
decide and orchestrate; SpotKit performs deterministic project operations.

## Available

| Skill                                                             | Use it for                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`build-hubspot-app`](build-hubspot-app/SKILL.md)                 | Plan, scaffold, extend, adopt, diagnose, verify, and release a production-oriented HubSpot app             |
| [`review-hubspot-app`](review-hubspot-app/SKILL.md)               | Audit correctness, security, tenant isolation, scopes, entitlements, UX, operations, and release readiness |
| [`model-hubspot-crm`](model-hubspot-crm/SKILL.md)                 | Design objects, properties, pipelines, associations, labels, projects, tasks, scopes, and safe migrations  |
| [`design-hubspot-automation`](design-hubspot-automation/SKILL.md) | Choose and design reliable webhooks, workflow actions, app events, agent tools, retries, and idempotency   |
| [`operate-hubspot-app`](operate-hubspot-app/SKILL.md)             | Deploy, diagnose, smoke-test, recover, roll back, and hand off HubSpot applications safely                 |

The skills support pure HubSpot projects, OAuth marketplace apps, private-static
components, the complete SpotKit feature catalog, one-object persistence,
portable hosting, existing-project adoption, and evidence-based production
review. CRM modeling guidance covers the association and activity details that
generic app scaffolding cannot infer. Automation guidance makes provider retries,
rate limits, publication, and partial side effects explicit.
Operational guidance connects source/build evidence to hosting, OAuth, portal,
storage, incident, release, and rollback state.

## Install and invoke

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/build-hubspot-app skills/review-hubspot-app \
  skills/model-hubspot-crm skills/design-hubspot-automation \
  skills/operate-hubspot-app \
  "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Invoke `$build-hubspot-app` for implementation and `$review-hubspot-app` for a
read-only audit. Invoke `$model-hubspot-crm` before committing to objects,
properties, associations, labels, projects, or task behavior.
Invoke `$design-hubspot-automation` for webhooks, workflow actions, app events,
agent tools, retries, and rate-limit behavior.
Invoke `$operate-hubspot-app` for installations, deployments, portal diagnostics,
incidents, smoke tests, and rollbacks.
Inside this repository, point the agent at the skill source if repository-local
skills are not discovered automatically.

Validate every repository skill with:

```bash
pnpm skills:validate
```

CI enforces frontmatter, naming, concise size, UI metadata, invocation prompts,
linked resources, and the skill-folder content policy.

## Roadmap

The initial app lifecycle suite now covers building, reviewing, CRM modeling,
automation, and operations. Add another skill only when a repeated workflow has
real evidence, a distinct triggering boundary, and a deterministic execution
layer. Improve these skills from actual project use before broadening the suite.

Keep each skill concise and self-contained. Store detailed decision tables in
`references/`, deterministic repeated operations in `scripts/`, and output
templates in `assets/`. Never include credentials or customer-specific data.
