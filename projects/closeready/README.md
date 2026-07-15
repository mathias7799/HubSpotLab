# CloseReady

CloseReady is a HubSpot-native deal readiness and pipeline-governance app. It
lets revenue teams define different completion rules for every pipeline and
stage, then explains exactly what prevents a deal from progressing or closing.

## Product surfaces

- **Deal card:** readiness score, blockers, warnings, and direct remediation.
- **App page:** pipeline health, blocked deals, and readiness by owner/stage.
- **Configuration:** per-pipeline and per-stage required data points.
- **Guarded transition:** validates every CloseReady blocker before moving a
  deal to its target stage.

HubSpot-native required stage properties provide absolute blocking for deal
properties. CloseReady evaluates richer conditions such as labeled associations,
required fields on associated contacts or companies, line items, quotes, and
open tasks. Rules can apply to one exact source-to-target transition or to every
move into a target stage. See the [product plan](docs/product-plan.md) and
[enforcement model](docs/enforcement.md).

## Current foundation

CloseReady now contains the deterministic engine, a portable HubSpot API client,
the web-standard HTTP contract, and the first native HubSpot configuration page.
The runtime adapters and OAuth token store are intentionally separate from the
business logic so the same service can run on Node, Lambda, Azure Functions, or
HubSpot serverless when available.

The HubSpot experience is split into three focused surfaces:

- the app overview shows target-stage coverage, blockers, warnings, and rule
  types per pipeline;
- the app's `/settings` route owns transition-rule configuration;
- the native Connected Apps settings page reports installation health, OAuth
  access, portal inventory, and app-object status.

![CloseReady pipeline overview](docs/images/overview.png)

![CloseReady rule settings](docs/images/rule-settings.png)

![CloseReady native app settings](docs/images/native-settings.png)

## HubSpot app-object approval

Rules use exactly one HubSpot app object. Runtime OAuth cannot create that
schema, so HubSpot must first approve the `CloseReady` app prefix and
`CLOSEREADY_RULE` object name through the
[app objects request form](https://app.hubspot.com/l/developer-overview/appObjectsEventsRequest).
Until approval, the configuration page remains useful in read-only mode and
loads the portal's pipelines, stages, properties, and association labels.

The production component is kept outside the upload tree at
`apps/hubspot/app-object-template/app-object-hsmeta.json` so development builds
are not rejected. After approval, copy it into
`apps/hubspot/src/app/app-objects/app-object-hsmeta.json`, upload the HubSpot
project, and reinstall the app. Unpublished apps must be installed with the test
OAuth client generated from HubSpot's Distribution tab.

```bash
pnpm --filter @hubspotlab/closeready-core test
pnpm --filter @hubspotlab/closeready-core typecheck
pnpm --filter @hubspotlab/closeready-api test
pnpm --filter @hubspotlab/closeready-api typecheck
pnpm --dir projects/closeready/apps/hubspot/src/app/pages typecheck
```

The placeholder `closeready.example.com` origin in the HubSpot app metadata and
page client must be replaced with the deployed API origin before upload.
