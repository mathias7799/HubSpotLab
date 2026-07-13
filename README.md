# HubSpotLab

HubSpotLab is an MIT-licensed monorepo for reusable HubSpot apps, developer
tools, shared libraries, automation, agent skills, examples, and documentation.

The repository is intentionally language-agnostic at the root. Each project
owns its runtime, dependencies, tests, and release process while following the
same repository-wide conventions.

## Repository layout

| Path        | Purpose                                                 |
| ----------- | ------------------------------------------------------- |
| `apps/`     | Deployable HubSpot apps and services                    |
| `packages/` | Reusable libraries and shared modules                   |
| `tools/`    | CLIs, scripts, generators, and developer utilities      |
| `skills/`   | Agent skills and supporting resources                   |
| `docs/`     | Architecture, guides, decisions, and reference material |
| `examples/` | Small, runnable examples and integration demos          |

Each top-level area contains its own guidance. New projects should have a
README that states their purpose, setup, validation, and ownership.

## Getting started

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
```

Use Node.js 24 or newer. Choose the narrowest matching top-level area for new
work and keep each project independently understandable and deployable.

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository conventions and
[docs/architecture.md](docs/architecture.md) for the design principles behind
the monorepo. The [TidsHub architecture guide](docs/tidshub.md) documents the
first complete app and its trust boundaries.

## Current apps

| Project                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `apps/tidshub-hubspot` | TidsHub OAuth UI-extension project                     |
| `apps/tidshub-api`     | Portable OAuth/API backend for Node, Lambda, and Azure |

## Status

TidsHub is the first production-oriented reference application. It uses native
HubSpot UI extensions, one custom object, signed API requests, portable OAuth,
and an encrypted durable token store.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and
[LICENSE](LICENSE) for reuse terms.
