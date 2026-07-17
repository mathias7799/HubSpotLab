# SpotKit roadmap

## 0.1: project foundation

- `create` command with HubSpot page, card, settings, and Node API templates;
- safe non-destructive generation;
- `doctor` checks for metadata, OAuth URLs, origins, components, and env files;
- unit tests and end-to-end generated-project validation;
- repository and product documentation.

## 0.2: shared OAuth runtime

- [x] OAuth install, callback, refresh, and installation lookup;
- [x] HubSpot signature v3 verification;
- [x] encrypted Upstash and local-only memory token-store adapters;
- [x] generated OAuth and health endpoints;
- [x] JSON and strict production diagnostics;
- [ ] migration path for TidsHub and CloseReady.

## 0.3: persistence and hosting

- [x] zero-custom-object encrypted Upstash storage recipe;
- [x] optional one-custom-object HubSpot storage recipe;
- [x] encrypted portable configuration store;
- [x] AWS Lambda and Azure Functions adapters;
- [x] container and generic Node deployment assets;
- [x] production hosting diagnostics;
- [x] clean-room bundle, Lambda invocation, and container smoke tests.

## 0.4: feature catalog

- [x] safe additive `spotkit add` command and catalog;
- [x] official 2026.03 webhook metadata and secure receiver;
- [x] official 2026.03 workflow-action metadata and secure execution endpoint;
- [x] atomic idempotency with retry release;
- [x] app objects and app-object associations;
- [x] app events and authenticated send helper;
- [x] gated agent-tool recipe;
- [x] private-static profile with optional endpoint and private app functions;
- [x] SCIM recipe with profile and prerequisite enforcement.

## 0.5: local development

- [x] coordinated API and HubSpot project-development workflow;
- [x] temporary Cloudflare Tunnel and ngrok integration;
- [x] callback, feature-target, environment, and permitted-origin sync;
- [x] OAuth reconnect command with explicit `--open` confirmation.

## 0.6: release workflow

- [x] strict release check and confirmation-gated HubSpot upload;
- [x] secret, reserved-origin, and temporary-origin leak checks;
- [x] deployed HTTP/OAuth smoke-test command;
- [x] authenticated browser smoke-test recipe;
- [x] metadata-safe screenshot and documentation refresh command;
- [x] self-contained publishable package and tested `pnpm dlx` installation;
- [x] npm provenance release workflow.
