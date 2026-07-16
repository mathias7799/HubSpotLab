# CloseReady product tour

CloseReady gives administrators a rule-authoring surface and gives sales reps a
guarded deal-stage workflow inside HubSpot. Rules are evaluated against live CRM
data at the moment a rep checks or performs a transition.

## 1. Confirm setup and coverage

![Pipeline readiness overview](images/overview.png)

The overview answers four operational questions:

- Is the app connected to the current HubSpot portal?
- Is the single CloseReady rule store available?
- How many blocking and warning rules are active?
- Which target stages are governed and which still have no rules?

Coverage is shown per pipeline. A target stage is governed when at least one
enabled rule applies to a transition entering that stage.

## 2. Define transition requirements

![Transition requirement builder](images/configuration-page.png)

An administrator selects the source stage, target stage, requirement type, and
result. A source of **Any stage** applies the rule to every move into the target
stage. Selecting one source creates an exact source-to-target rule.

Supported requirements include:

| Requirement                | Examples                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Deal property              | Amount, close date, owner, custom deal fields                                              |
| Associated record          | At least one contact or company, optionally with a label such as Primary or Decision maker |
| Associated record property | City on the Primary company, email on every Decision maker contact                         |
| Deal metric                | Minimum line items, approved quotes, or open tasks                                         |

Rules can block the transition or show a warning. Existing requirements support
Edit, Pause, Enable, and confirmed Delete actions. CloseReady rejects duplicate
requirements on the same transition.

## 3. Check a deal before moving it

![Blocked deal transition](images/deal-blocked.png)

The deal card defaults to the next pipeline stage while allowing another target
to be selected. **Check readiness** loads current deal properties, associations,
associated-record properties, and metrics from HubSpot.

The result is intentionally actionable:

- passed requirements are confirmed;
- warnings remain visible but do not prevent the guarded move;
- blockers explain the missing data;
- **Check again** refreshes the evaluation after the rep fixes the deal;
- **Move to [stage]** only appears when every blocker passes;
- transitions without configured rules remain unavailable through the card.

## Enforcement boundary

CloseReady governs moves performed through its deal card. HubSpot does not let a
public UI extension intercept the platform's native stage control. For absolute
blocking on native stage changes, mirror supported deal-property requirements in
HubSpot's native pipeline rules. Association labels and associated-record fields
remain enforced through the CloseReady guarded move.
