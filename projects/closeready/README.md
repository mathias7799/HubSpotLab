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

- the deal sidebar card checks a selected transition and performs the guarded
  move only when every blocker passes;
- the app overview shows target-stage coverage, blockers, warnings, and rule
  types per pipeline;
- the app's `/settings` route owns transition-rule configuration;
- the native Connected Apps settings page reports installation health, OAuth
  access, portal inventory, and the active storage mode.

![CloseReady pipeline overview](docs/images/overview.png)

![CloseReady rule settings](docs/images/rule-settings.png)

![CloseReady native app settings](docs/images/native-settings.png)

## Storage that fits the portal

CloseReady prefers exactly one custom object named `closeready_rule`. The
backend reuses it on every health check and attempts to create it when the
portal and installation token permit schema writes. No second custom object is
ever created.

HubSpot custom objects require an Enterprise entitlement. On Standard portals,
or whenever HubSpot denies schema administration, CloseReady automatically uses
the portable backend's AES-256-GCM encrypted Upstash store. Rule authoring,
evaluation, and guarded transitions behave the same in both modes. Production
deployments already require this durable store for OAuth tokens, so the fallback
does not introduce another service.

An eligible Enterprise administrator can perform an optional one-time native
object bootstrap from the repository root:

```bash
pnpm exec hs account auth
pnpm exec hs custom-object create-schema \
  --account <account-name-or-id> \
  --path projects/closeready/services/api/schema/closeready-rule.schema.json
```

If HubSpot enables the CLI's custom-object permission, CloseReady will discover
the schema automatically. Native mode also requires adding
`crm.schemas.custom.read`, `crm.objects.custom.read`, and
`crm.objects.custom.write` to `HUBSPOT_SCOPES`; these are optional app scopes so
they do not block installation on Standard portals. Otherwise leave
`RULE_STORAGE=auto`; setup remains ready and selects the encrypted portable
store. Operators can force a mode with `RULE_STORAGE=hubspot` or
`RULE_STORAGE=external`.

When a portal allows custom objects in HubSpot's Data Model UI but does not
grant schema-write API access, create one object named `CloseReady rule` with
internal name `closeready_rule` and primary property `rule_name`. CloseReady
detects this minimal administrator-created object and stores each validated rule
as a compact JSON record in that primary property; no additional custom
properties or second object are required.

After the first deployment, add the **CloseReady** card to the standard deal
record layout: **Settings > Objects > Deals > Record customization > Standard
view > Add card > Card library > CloseReady**. Save the layout once; every deal
then gets the guarded transition flow.

```bash
pnpm --filter @hubspotlab/closeready-core test
pnpm --filter @hubspotlab/closeready-core typecheck
pnpm --filter @hubspotlab/closeready-api test
pnpm --filter @hubspotlab/closeready-api typecheck
pnpm --dir projects/closeready/apps/hubspot/src/app/pages typecheck
```

The placeholder `closeready.example.com` origin in the HubSpot app metadata and
page client must be replaced with the deployed API origin before upload.
