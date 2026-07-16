# CloseReady product plan

## Product promise

CloseReady answers one question consistently: **what must be true before this
deal can enter its next stage?** Administrators configure rules per pipeline and
target stage. Salespeople see a short actionable checklist instead of discovering
missing data during forecasting or after handoff.

## Configuration model

Every rule belongs to one pipeline and a source-to-target stage transition. The
source may be a specific stage or a wildcard. A rule contains:

- a subject: an arbitrary deal property, an association count, a property on an
  associated contact/company, or an operational metric;
- an optional association label such as `Decision maker`;
- `any` or `all` matching-record semantics for associated-record properties;
- an operator and optional expected value;
- blocker or warning severity;
- enabled state;
- whether a compatible deal property must also be configured as a native
  HubSpot required-stage property.

Rules are not global by accident. Administrators may deliberately copy a rule
set to another pipeline, then edit the copy independently.

## Product surfaces

### Deal record card

- current and target stages;
- concise blockers before warnings;
- actionable instructions for missing data;
- guarded stage transition after all blockers pass.

### App page: current

- portal, storage, and active-rule setup health;
- blocker, warning, and governed-stage totals;
- target-stage coverage by pipeline;
- requirement-type mix.

### App page: future analytics

- blocked deals by pipeline, stage, owner, and closing period;
- readiness distribution and recent regressions;
- drill-down from a failed rule to affected deals;
- configuration workspace for pipelines, stages, and rules.

### Settings

- installation health and one-object provisioning;
- per-rule status for requirements an administrator has mirrored in HubSpot;
- explanatory guidance for CloseReady versus native HubSpot enforcement.

Future settings work includes a native-rule setup checklist and direct pipeline
settings links.

## Delivery sequence

1. Deterministic rule engine and validation. Complete.
2. One-object rule persistence and encrypted portable fallback. Complete.
3. OAuth, signed requests, token refresh, and Node runtime. Complete.
4. Pipeline, property, and association-label discovery. Complete.
5. Rule configuration with edit, pause, enable, duplicate protection, and
   confirmed deletion. Complete.
6. Deal card, live readiness evaluation, and guarded transition. Complete.
7. Pipeline coverage overview and setup health. Complete.
8. Native-enforcement setup guidance. Documented; deep-link workflow remains.
9. Deal-level analytics, owner rollups, and regression history. Planned.

## Deliberate constraints

- HubSpot renders all product UI.
- No HubSpot serverless or Enterprise-only runtime dependency.
- At most one custom object, used only for configuration rules.
- No claim that a UI extension can intercept native stage changes.
- Absolute blocking uses HubSpot's own required-stage properties.
