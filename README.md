# HubSpotLab

HubSpotLab is an MIT-licensed monorepo for reusable HubSpot apps, developer
tools, shared libraries, automation, agent skills, examples, and documentation.

The repository is intentionally language-agnostic at the root. Each project
owns its runtime, dependencies, tests, and release process while following the
same repository-wide conventions.

## Repository layout

| Path        | Purpose                                                     |
| ----------- | ----------------------------------------------------------- |
| `projects/` | Self-contained products with their apps, services, and docs |
| `packages/` | Reusable libraries and shared modules                       |
| `tools/`    | CLIs, scripts, generators, and developer utilities          |
| `skills/`   | Agent skills and supporting resources                       |
| `docs/`     | Repository-wide architecture, decisions, and conventions    |
| `examples/` | Small, runnable examples and integration demos              |

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
the monorepo. The [TidsHub project](projects/tidshub/README.md) documents the
first complete product and its trust boundaries.

## Current projects

| Project               | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `projects/tidshub`    | Time registration with a HubSpot app and portable OAuth API |
| `projects/closeready` | Pipeline-specific deal readiness and close governance       |

## Status

TidsHub is the first production-oriented reference application. It uses native
HubSpot UI extensions, one custom object, signed API requests, portable OAuth,
and an encrypted durable token store.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and
[LICENSE](LICENSE) for reuse terms.
