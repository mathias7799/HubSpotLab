# Review reporting

## Severity

- **Critical:** exploitable cross-tenant access, credential disclosure,
  destructive unauthorized mutation, or a release-breaking defect with broad
  unavoidable impact.
- **High:** security control bypass, data corruption/loss, core workflow failure,
  or production deployment that cannot operate safely.
- **Medium:** important workflow, permission, retry, association, or operational
  failure with a practical workaround or narrower trigger.
- **Low:** localized robustness, accessibility, maintainability, documentation,
  or UX issue with limited immediate impact.

Rate likelihood and blast radius from evidence. Do not inflate severity because
an area is security-related, and do not lower it merely because a test has not
yet reproduced the production condition.

## Finding format

```markdown
### [High] Tenant selection trusts a caller-controlled portal ID

Evidence: `services/api/src/app.ts:123` selects the installation from the query
parameter before verifying HubSpot request context.

Impact: A signed-in user who can alter the request can access another installed
portal's configuration.

Trigger: Two installed portals and a request with the second portal's ID.

Remediation: Derive the portal from verified HubSpot context, then reject any
conflicting caller value.

Verify: Add a cross-portal negative test and exercise both installations.
```

## Report order

1. Findings, highest severity first.
2. Open questions that materially affect the conclusion.
3. Verification performed and authoritative outputs.
4. Residual risks or unavailable environments.
5. Short overall assessment.

Do not bury findings in a long summary. If there are no findings, state that
explicitly and list the exact surfaces and production boundaries not verified.
