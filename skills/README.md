# HubSpotLab agent skills

Agent skills make HubSpotLab's architecture, safety rules, and release evidence
available to AI coding agents without duplicating implementation logic. Skills
decide and orchestrate; SpotKit performs deterministic project operations.

## Available

| Skill                                               | Use it for                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [`build-hubspot-app`](build-hubspot-app/SKILL.md)   | Plan, scaffold, extend, adopt, diagnose, verify, and release a production-oriented HubSpot app             |
| [`review-hubspot-app`](review-hubspot-app/SKILL.md) | Audit correctness, security, tenant isolation, scopes, entitlements, UX, operations, and release readiness |

The skills support pure HubSpot projects, OAuth marketplace apps, private-static
components, the complete SpotKit feature catalog, one-object persistence,
portable hosting, existing-project adoption, and evidence-based production
review.

## Install and invoke

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/build-hubspot-app skills/review-hubspot-app \
  "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Invoke `$build-hubspot-app` for implementation and `$review-hubspot-app` for a
read-only audit.
Inside this repository, point the agent at the skill source if repository-local
skills are not discovered automatically.

Validate every repository skill with:

```bash
pnpm skills:validate
```

CI enforces frontmatter, naming, concise size, UI metadata, invocation prompts,
linked resources, and the skill-folder content policy.

## Roadmap

Build skills only when a repeated workflow has real evidence and a deterministic
execution layer. The likely next set is:

1. **operate-hubspot-app** — installation, portal diagnostics, smoke testing,
   incident evidence, and rollback guidance;
2. **design-hubspot-automation** — workflows, webhooks, custom actions, agent
   tools, idempotency, and rate-limit decisions;
3. **model-hubspot-crm** — objects, properties, associations, labels, pipelines,
   and the one-app-object constraint;

Keep each skill concise and self-contained. Store detailed decision tables in
`references/`, deterministic repeated operations in `scripts/`, and output
templates in `assets/`. Never include credentials or customer-specific data.
