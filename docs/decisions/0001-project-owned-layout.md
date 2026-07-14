# 0001: Group deployables by product

## Status

Accepted — 2026-07-14.

## Context

Keeping every deployable directly under a root `apps/` directory separates the
parts of one product as soon as it gains a backend, worker, second HubSpot app,
or substantial documentation. Product ownership and deployment boundaries then
have to be reconstructed from naming conventions.

## Decision

Group product-owned code under `projects/<project-name>/`:

```text
projects/<project-name>/
├── apps/
├── services/
├── docs/
├── package.json
└── README.md
```

Keep cross-project libraries in `packages/`, repository tooling in `tools/`,
agent extensions in `skills/`, examples in `examples/`, and repository-wide
architecture and decisions in `docs/`.

Each project owns orchestration scripts in its package manifest. Root scripts
may expose convenience aliases without duplicating the underlying commands.

## Consequences

- Product code, docs, screenshots, and deployment assets move together.
- Multiple apps and services can be added without expanding a flat root list.
- Workspace globs must account for nested project packages and HubSpot UI
  extension component packages.
- Cross-project code must be promoted deliberately into `packages/` instead of
  imported from another project's directory.
