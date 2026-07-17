# HubSpotLab

Production-oriented HubSpot apps, developer tooling, and agent workflows in one
open-source monorepo.

[![CI](https://github.com/mathias7799/HubSpotLab/actions/workflows/ci.yml/badge.svg)](https://github.com/mathias7799/HubSpotLab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24-339933.svg)](package.json)
[![HubSpot 2026.03](https://img.shields.io/badge/HubSpot-2026.03-ff7a59.svg)](tools/spotkit/README.md)

HubSpotLab is both a working product laboratory and a toolkit for building the
next app. It contains two real HubSpot products, a portable OAuth/security
runtime, the SpotKit CLI and terminal UI, and a reusable agent skill that teaches
AI coding agents how to make sound HubSpot architecture and release decisions.

## Start here

```bash
corepack enable
pnpm install
pnpm spotkit ui
```

The SpotKit control center discovers every HubSpot project and brings overview,
diagnostics, lifecycle upgrades, origin management, release checks, OAuth
reconnect, and deployed smoke testing into one workflow. Use `spotkit create`
for non-overwriting project scaffolding.

Prefer reproducible commands or CI?

```bash
pnpm spotkit create handoff-ready \
  --directory projects \
  --name "HandoffReady" \
  --api-origin https://api.handoff-ready.com
pnpm spotkit add webhooks projects/handoff-ready
pnpm spotkit doctor projects/handoff-ready --strict
```

## The platform

```mermaid
flowchart LR
    Idea[Product idea] --> Skill[build-hubspot-app skill]
    Skill --> SpotKit[SpotKit CLI + TUI]
    SpotKit --> Project[Self-contained HubSpot project]
    Project --> Native[App page · CRM card · Settings]
    Project --> Features[Webhooks · Workflows · App objects · Agent tools]
    Project --> Runtime[Portable OAuth + security runtime]
    Runtime --> Hosts[Node · Docker · AWS · Azure]
    Project --> Release[Doctor · Validate · Smoke · Release]
```

- **Agent skills decide:** select the right profile, component, persistence,
  entitlement, and verification path.
- **SpotKit executes:** scaffold, extend, inspect, diagnose, develop, migrate,
  document, and release with safe defaults.
- **Projects own products:** apps, services, tests, screenshots, and operational
  documentation stay together.
- **The runtime protects boundaries:** OAuth tokens, signatures, encryption,
  tenant isolation, refresh, and hosting adapters remain outside UI extensions.

## What ships today

| Product                     | What it demonstrates                                                                                                             | Start here                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **TidsHub**                 | Weekly time registration, CRM associations, project/task context, editing, approvals, and operational dashboards                 | [Product guide](projects/tidshub/README.md)         |
| **CloseReady**              | Pipeline-specific readiness rules, associated-record requirements, guarded deal transitions, configuration, and clear blocker UX | [Product guide](projects/closeready/README.md)      |
| **SpotKit 0.7**             | HubSpot project generator, feature catalog, diagnostics, lifecycle management, release tooling, and interactive terminal UI      | [Tool guide](tools/spotkit/README.md)               |
| **SpotKit runtime**         | Portable OAuth, signature v3, encrypted token/configuration storage, idempotency, and cloud adapters                             | [Package guide](packages/spotkit-runtime/README.md) |
| **Build HubSpot App skill** | Agentic planning, implementation, adoption, verification, and release workflow backed by SpotKit                                 | [Skill source](skills/build-hubspot-app/SKILL.md)   |

## SpotKit at a glance

| Area    | Capabilities                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create  | OAuth marketplace and static private profiles; app page, CRM card, settings, portable API, Docker/AWS/Azure targets                                           |
| Extend  | Webhooks, workflow actions, one app object, app-object associations, app events, agent tools, optional app functions, and SCIM                                |
| Develop | Coordinated API/HubSpot development, origin synchronization, Cloudflare/ngrok tunnels, and review-first OAuth reconnect                                       |
| Operate | Interactive TUI, project/workspace inventory, lifecycle manifests, non-destructive upgrade plans, and strict doctor diagnostics                               |
| Release | Secret/origin scanning, official HubSpot validation, confirmation-gated build upload, deployed smoke tests, screenshot galleries, and npm provenance workflow |
| Secure  | OAuth state binding, signature v3, AES-256-GCM tenant isolation, durable Upstash storage, atomic idempotency, and localhost-only unsafe modes                 |

SpotKit enforces at most one app object per project. HubSpot-hosted app functions
remain optional and never become an Enterprise-only requirement for marketplace
apps. Gated HubSpot components still require the relevant HubSpot approval and
account entitlement.

## Build with an AI agent

The repository-owned [`build-hubspot-app`](skills/build-hubspot-app/SKILL.md)
skill turns natural-language product requests into evidence-driven SpotKit work.
It handles requests such as:

- “Design a pure HubSpot app with no backend.”
- “Add signed webhooks and an unpublished workflow action.”
- “Adopt this existing HubSpot project without overwriting product code.”
- “Prepare this app for HubSpot validation and a release candidate.”

Install the skill into Codex when developing outside this repository:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/build-hubspot-app "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Then invoke it as `$build-hubspot-app`. See the [skills catalog](skills/README.md)
for the agentic-development roadmap.

## Choose the right architecture

| Need                                                                          | Recommended shape                                                                      |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| HubSpot UI and supported client APIs cover every operation                    | Keep it HubSpot-only; do not invent a backend                                          |
| OAuth marketplace distribution, durable tokens, webhooks, or external actions | Use SpotKit's marketplace profile and portable API                                     |
| HubSpot-hosted functions or SCIM                                              | Use a separate `private-static` project                                                |
| Portal-owned application data                                                 | Prefer zero objects; use the single app-object recipe only when justified and entitled |

Generated marketplace services are web-standard and can run on generic Node,
Docker, AWS Lambda, or Azure Functions. Serverless is a hosting option, not a
product requirement.

## Repository map

| Path                              | Purpose                                             |
| --------------------------------- | --------------------------------------------------- |
| [`projects/`](projects/README.md) | Self-contained products and deployable surfaces     |
| [`packages/`](packages/README.md) | Shared runtime libraries and deliberate interfaces  |
| [`tools/`](tools/README.md)       | SpotKit and future developer tooling                |
| [`skills/`](skills/README.md)     | Reusable agent workflows and domain knowledge       |
| [`docs/`](docs/README.md)         | Architecture, decisions, and repository conventions |
| [`examples/`](examples/README.md) | Small integration examples                          |

## Validate the repository

Use Node.js 24 and pnpm 11.6 or newer:

```bash
pnpm format:check
pnpm skills:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm --dir tools/spotkit build
```

Validate one app or the whole HubSpot workspace:

```bash
pnpm spotkit doctor projects/tidshub --strict
pnpm spotkit inventory projects
```

CI also builds and installs SpotKit from its packed npm tarball, generates a
standalone app, adds features, runs its tests/typechecks/build, and checks its
lifecycle state outside this repository.

## Maturity and release status

HubSpotLab is pre-1.0. TidsHub and CloseReady are functional reference products,
and SpotKit 0.7 passes its local, clean-room package, and official HubSpot
validation gates. Deployments still require operator-owned HubSpot credentials,
a stable public origin where applicable, and production storage credentials.

The public npm release workflow is prepared with provenance and tag/version
guards, but `@hubspotlab/spotkit` has not yet been published. No README command
pretends otherwise.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing repository structure and
[SECURITY.md](SECURITY.md) for private vulnerability reporting. HubSpotLab is
available under the [MIT license](LICENSE).
