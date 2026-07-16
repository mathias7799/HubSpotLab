# Enforcement model

CloseReady uses two complementary enforcement layers.

## Native hard requirements

HubSpot supports rules on individual deal stages, including required deal
properties. These rules are pipeline-specific and can prevent a user from
entering Closed won until the required fields are populated.

CloseReady can mark compatible wildcard-source property rules as
`nativeEnforcement`. Native required fields apply to every move into a target
stage, so an exact source-stage rule cannot be represented natively. Configure
the matching rule in HubSpot's pipeline settings for the selected pipeline:

```text
/pipelines-settings/{portalId}/object/0-3/{pipelineId}
```

The public Pipelines API does not expose a supported mutation contract for
these governance rules, so CloseReady must not silently rely on private HubSpot
endpoints to configure them.
The administrator must configure the property in HubSpot and then mark the
CloseReady rule as mirrored; the flag is an auditable status, not a claim that
CloseReady mutated pipeline settings.

## CloseReady blockers

Conditions involving associations, tasks, quotes, line items, or compound logic
are evaluated by CloseReady. They block CloseReady's guarded transition and are
shown prominently in the deal card. They cannot prevent
a sufficiently privileged user from changing the native deal stage elsewhere
in HubSpot.

The deal sidebar card is therefore the enforcement entry point: choose a target
stage, check readiness, and use the resulting **Move to [stage]** action. The
backend evaluates fresh HubSpot data and writes `dealstage` only when no blocker
fails. HubSpot does not expose an extension hook that can cancel a stage change
performed with the native deal-stage control.

The UI must always label this distinction clearly:

- **HubSpot requirement** — native stage transition is blocked.
- **CloseReady blocker** — guarded transition is blocked and the native path may
  still be used outside CloseReady.
