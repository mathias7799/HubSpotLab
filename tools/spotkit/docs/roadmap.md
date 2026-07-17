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
- [ ] app objects and app-object associations;
- [ ] app events;
- [ ] gated agent-tool recipe;
- [ ] private-app profiles for app functions and SCIM.

## 0.5: local development

- coordinated API and HubSpot upload workflow;
- temporary Cloudflare Tunnel or ngrok integration;
- callback and permitted-origin synchronization;
- OAuth reconnect command with explicit confirmation boundaries.

## 0.6: release workflow

- build and upload command;
- secret and temporary-origin leak checks;
- authenticated browser smoke-test recipe;
- screenshot and documentation refresh command;
- publishable package and `pnpm dlx` installation.
