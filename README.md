# HubSpotLab

HubSpotLab is a monorepo for reusable HubSpot apps, developer tools, shared
libraries, automation, agent skills, examples, and documentation.

The repository is intentionally language-agnostic at the root. Each project
owns its runtime, dependencies, tests, and release process while following the
same repository-wide conventions.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/` | Deployable HubSpot apps and services |
| `packages/` | Reusable libraries and shared modules |
| `tools/` | CLIs, scripts, generators, and developer utilities |
| `skills/` | Agent skills and supporting resources |
| `docs/` | Architecture, guides, decisions, and reference material |
| `examples/` | Small, runnable examples and integration demos |

Each top-level area contains its own guidance. New projects should have a
README that states their purpose, setup, validation, and ownership.

## Getting started

1. Choose the appropriate top-level area.
2. Create a self-contained project directory with a descriptive kebab-case
   name.
3. Include a project README and keep dependencies local to the project.
4. Add tests and validation commands alongside the implementation.
5. Document shared architectural decisions in `docs/decisions/`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository conventions and
[docs/architecture.md](docs/architecture.md) for the design principles behind
the monorepo.

## Status

This repository is in its bootstrap phase. Tooling will be introduced when the
first concrete project requires it, keeping the root free from speculative
dependencies.
