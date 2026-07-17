# Product and UX review

## Workflow clarity

- Confirm each surface has one clear primary job and an obvious next action.
- Use HubSpot terminology familiar to the target user. Explain domain concepts
  such as approver, primary company, target stage, or task association in place.
- Minimize clicks for repeated actions; preserve useful context after save,
  edit, delete, approval, or navigation.
- Make destructive actions explicit, scoped, and recoverable where possible.

## Required states

Review every app page, card, settings view, picker, and nested detail for:

- initial loading and progressive loading;
- useful empty state;
- unavailable entitlement or missing installation;
- validation error next to the affected input;
- API/network failure with a retry path;
- permission/scope failure with administrator guidance;
- success confirmation without losing context;
- stale data and concurrent change behavior;
- long labels, narrow cards, localization, and text wrapping.

Avoid status text that truncates to ambiguous fragments. Prefer a concise state
label plus a complete explanation, for example: “Company city is required, but
this deal has no associated company labeled Primary.”

## Data selection and associations

- Show selected records with human names, object type, and a direct HubSpot link
  where the host supports it.
- Default dependent pickers from the selected association. A selected deal or
  contact should surface its associated tasks before global search results.
- Clearly separate required association, optional task, label, and completion
  filters. Persist intentional defaults.
- Prevent invalid association combinations before submission and translate API
  failures into actionable language.

## Dashboards and detail

- Make summaries answer an operational question, not merely display totals.
- Support drill-down from week → day → registration or pipeline → stage → rule.
- Keep filters, date range, coverage definition, and timezone visible.
- Distinguish incomplete, blocked, awaiting approval, approved, and failed.
- Preserve links back to the associated contact, company, deal, ticket, project,
  task, or app-object record.

## Accessibility and HubSpot fit

- Use supported HubSpot UI components and interaction patterns.
- Provide meaningful labels, keyboard reachability, focus order, and non-color
  status cues.
- Keep card copy scannable at HubSpot's constrained widths.
- Verify UI placement and behavior in an authenticated test portal; source-level
  component tests do not prove host rendering.
