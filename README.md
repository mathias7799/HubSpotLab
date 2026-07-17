# HubSpotLab

HubSpotLab is an MIT-licensed monorepo for production-oriented HubSpot apps,
developer tools, shared libraries, automation, agent skills, examples, and
documentation.

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

## Current projects

| Project    | Purpose                                                        | Start here                                     |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------- |
| TidsHub    | Time registration, CRM associations, and weekly approvals      | [Project guide](projects/tidshub/README.md)    |
| CloseReady | Configurable deal-transition readiness and guarded stage moves | [Project guide](projects/closeready/README.md) |

Validate one product without running unrelated work:

```bash
pnpm --dir projects/tidshub validate
pnpm --dir projects/closeready test
pnpm --dir projects/closeready typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository conventions,
[docs/architecture.md](docs/architecture.md) for monorepo design principles,
and [projects/README.md](projects/README.md) for the product-owned layout.

## Developer tooling

[SpotKit](tools/spotkit/README.md) turns the proven TidsHub and CloseReady
project shape into a reusable CLI:

```bash
pnpm spotkit create handoff-ready --directory projects --name "HandoffReady"
pnpm spotkit doctor projects/handoff-ready
```

SpotKit generates a HubSpot app page, CRM card, native settings, portable Node
API, and a tested OAuth/security runtime with encrypted production token
storage. Its doctor checks metadata, scopes, origins, and deployment safety and
supports strict CI and JSON output. Generated production bundles target generic
Node, containers, AWS Lambda, and Azure Functions.

## Status

HubSpotLab is pre-1.0. TidsHub and CloseReady are functional reference products,
but deployments still require operator-owned HubSpot credentials, a public API
origin, and production-grade encrypted token persistence. Each project README
documents its own prerequisites, trust boundary, and validation commands.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting and
[LICENSE](LICENSE) for reuse terms.
