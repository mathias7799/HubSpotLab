# CloseReady product plan

## Product promise

CloseReady answers one question consistently: **what must be true before this
deal can enter its next stage?** Administrators configure rules per pipeline and
target stage. Salespeople see a short actionable checklist instead of discovering
missing data during forecasting or after handoff.

## Configuration model

Every rule belongs to one pipeline and one target stage. A rule contains:

- a data point, such as deal amount, associated contacts, line items, approved
  quotes, or open tasks;
- an operator and optional expected value;
- blocker or warning severity;
- enabled state;
- whether a compatible deal property must also be configured as a native
  HubSpot required-stage property.

Rules are not global by accident. Administrators may deliberately copy a rule
set to another pipeline, then edit the copy independently.

## Product surfaces

### Deal record card

- current readiness score and target stage;
- blockers before warnings;
- direct links or actions to complete missing data;
- guarded stage transition after all blockers pass;
- clear indication when a property is also hard-blocked by HubSpot.

### App page

- blocked deals by pipeline, stage, owner, and closing period;
- readiness distribution and recent regressions;
- drill-down from a failed rule to affected deals;
- configuration workspace for pipelines, stages, and rules.

### Settings

- installation health and one-object provisioning;
- default Closed won starter pack;
- links to HubSpot pipeline settings for native required fields.

## Delivery sequence

1. Deterministic rule engine and validation.
2. One-object rule persistence and signed portable API.
3. Pipeline/stage/property discovery.
4. Configuration app page.
5. Deal card and live readiness evaluation.
6. Pipeline dashboard and guarded transition.
7. Native-enforcement setup assistant and documentation.

## Deliberate constraints

- HubSpot renders all product UI.
- No HubSpot serverless or Enterprise-only runtime dependency.
- At most one custom object, used only for configuration rules.
- No claim that a UI extension can intercept native stage changes.
- Absolute blocking uses HubSpot's own required-stage properties.
