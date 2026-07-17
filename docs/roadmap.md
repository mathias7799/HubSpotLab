# HubSpotLab roadmap

HubSpotLab develops through evidence from real HubSpot applications. Projects
prove patterns, SpotKit turns repeatable operations into deterministic tooling,
and agent skills capture the judgment that cannot be reduced to a command.

The roadmap favors depth over catalog size. A new tool or skill is justified
only after repeated product work exposes a stable, reusable boundary.

## Now: harden the proof applications

TidsHub and CloseReady are the integration tests for the wider toolkit. Finish
their current production reviews before treating new product surface as the
priority.

Exit criteria:

- each external API has an explicit authorization model in addition to valid
  HubSpot request identity;
- multi-step CRM writes have compensation, resumption, or a clearly recoverable
  partial-failure state;
- each deployed app uses a stable operator-owned HTTPS origin;
- OAuth, settings, cards, app pages, and critical mutations are exercised in an
  authenticated test portal;
- SpotKit inventory and release checks agree with the recorded review evidence;
- product documentation describes prerequisites, limitations, recovery, and
  verified screenshots without overstating readiness.

## Next: make SpotKit a dependable 1.0 product

SpotKit is the product spine. It should own deterministic lifecycle work while
remaining useful without an AI agent.

Exit criteria:

- `@hubspotlab/spotkit` is published with provenance and install-tested through
  its documented public command;
- generated and adopted projects have a stable, versioned lifecycle contract;
- upgrade plans are tested against customized real-world fixtures and never
  overwrite product code silently;
- the CLI and TUI expose the same capabilities, confirmation boundaries, and
  machine-readable diagnostics;
- a clean-room app can be created, extended, developed, reviewed, packaged, and
  smoke-tested from the public artifact;
- documentation clearly distinguishes HubSpot entitlements, marketplace
  requirements, optional hosting targets, and local-only development behavior.

## Then: prove the agentic development loop

The existing five skills already cover building, reviewing, CRM modeling,
automation, and operations. Improve this suite through end-to-end use before
adding more skills.

Exit criteria:

- representative prompts and expected artifacts exist for every skill;
- the skills consistently invoke SpotKit for supported deterministic work;
- cross-skill handoffs preserve architecture decisions and verification
  evidence;
- at least one new app is taken from idea to reviewed release candidate using
  the documented agent workflow;
- recurring failures become tests, SpotKit checks, or concise skill guidance.

Likely later candidates include migration planning, portal data quality, and
HubSpot integration testing. They remain candidates until product evidence shows
that they need distinct triggers and cannot be covered cleanly by the existing
suite.

## Ongoing principles

- Prefer native HubSpot capabilities when they satisfy the requirement.
- Keep marketplace apps portable; HubSpot serverless functions are optional and
  must not become an Enterprise-only baseline.
- Use no custom object by default and at most one app object per project when it
  is justified and available.
- Keep agent judgment separate from deterministic project mutation.
- Treat screenshots, tests, diagnostics, and production reviews as evidence,
  not decoration.
