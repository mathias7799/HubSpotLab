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
properties. CloseReady evaluates richer conditions such as associated contacts,
line items, quotes, and open tasks. See the [product plan](docs/product-plan.md)
and [enforcement model](docs/enforcement.md).

## Current foundation

The first slice is the deterministic rule engine in `packages/core`. It is
independent of the UI and API so the deal card, dashboard, and guarded-stage
endpoint cannot disagree about readiness.

```bash
pnpm --filter @hubspotlab/closeready-core test
pnpm --filter @hubspotlab/closeready-core typecheck
```
