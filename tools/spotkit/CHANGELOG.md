# SpotKit changelog

All notable changes to SpotKit are documented here. SpotKit follows semantic
versioning while it is published under the `@hubspotlab/spotkit` package.

## 0.6.0

- publish SpotKit as a self-contained npm package with templates, runtime
  sources, documentation, and license;
- add strict `release-check` scans and optional official HubSpot validation;
- add confirmation-gated `upload` that creates, but never deploys, a HubSpot
  project build;
- add deployed HTTP and OAuth boundary checks through `spotkit smoke`;
- add metadata-safe, deterministic screenshot galleries through
  `spotkit docs-refresh`;
- validate the packed npm artifact in CI and publish releases with provenance;
- require Node.js 24 or newer while accepting compatible pnpm 11 releases.

## 0.5.0

- add coordinated API and HubSpot local development;
- add Cloudflare Tunnel and ngrok discovery and origin synchronization;
- add review-first OAuth reconnect tooling.

## 0.4.0

- add webhooks, workflow actions, one app object and its association, app
  events, agent tools, optional app functions, and SCIM recipes.

## 0.3.0

- add encrypted portable configuration and token storage;
- add Node, Docker, AWS Lambda, and Azure Functions deployment targets.

## 0.2.0

- add the shared OAuth, token refresh, and HubSpot signature runtime.

## 0.1.0

- add project generation, diagnostics, tests, and initial documentation.
