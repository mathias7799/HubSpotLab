# TidsHub production review

Review date: 2026-07-17

## Resolved in source

- Personal entry ownership, week submission, approval settings, pending approval
  lookup, and approval actions now derive the acting user from HubSpot's signed
  `userId` and `userEmail` request metadata. Production no longer trusts claimed
  owner/approver identity from the body or query.
- OAuth rejects protocol-relative, backslash, control-character, and external
  return paths; validates state shape/time; clears the state cookie; and
  coalesces concurrent refreshes per portal.
- The installed confirmation page now sends CSP, no-store, no-referrer, and
  nosniff headers.
- Regression tests cover signed metadata, malicious return paths, refresh
  concurrency, and installed-page headers.

## Release blockers

1. The checked-in `serveousercontent.com` API origin is a temporary preview URL,
   not an operator-owned production origin. SpotKit now rejects it in strict and
   release checks. Synchronize a stable HTTPS origin before upload.
2. Authenticated HubSpot browser verification must be repeated against the final
   deployed API/build for entries, associations, project/task selection, edit,
   delete, submission, and approval.
3. Repeat the association compensation test in an authenticated portal. The API
   now archives a newly created entry when association writing fails and returns
   an explicit `partial_write` response with the record ID if cleanup also
   fails.

## Evidence boundary

Source tests and HubSpot project validation do not prove final portal entitlement,
layout placement, custom-object creation, association definitions, or production
storage credentials. Record those results with the deployment release evidence.
