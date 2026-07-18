# HandoffReady workflow proof

HandoffReady is the first new product created after HubSpotLab introduced its
five-skill agent lifecycle and SpotKit 0.7. It is evidence for the workflow, not
a claim that deployment-only behavior has been verified.

## Architecture decision

- Profile: OAuth marketplace app with a portable API.
- Surfaces: app page, deal sidebar card, native settings, webhook receiver, and
  unpublished deal workflow action.
- Storage: encrypted portal configuration and OAuth installation storage.
- CRM model: existing deals, companies, contacts, and tickets; zero custom
  objects.
- Hosting: web-standard handler with Node, Docker, AWS Lambda, and Azure
  adapters. No HubSpot serverless requirement.

## Deterministic SpotKit operations

The project was created and extended with:

```bash
pnpm spotkit create handoffready --directory projects \
  --name "HandoffReady" \
  --api-origin https://handoffready.example.com
pnpm spotkit add webhooks projects/handoffready
pnpm spotkit add workflow-action projects/handoffready
pnpm spotkit inspect projects/handoffready --json
pnpm spotkit doctor projects/handoffready --json
```

The initial inventory found the app page, card, settings, webhooks, and workflow
action with zero app objects. Product customization exposed a false diagnostic:
doctor required the generated `/workflow-actions/example` route and handler
name. SpotKit was improved to validate the action URL from metadata and prove
that exact route is present in the feature handler. A regression fixture now
renames both route and handler.

## Product behavior proved in source

- Required deal properties and company/contact associations produce explicit
  readiness items.
- Ticket creation rechecks the deal's live closed-won state immediately before
  mutation.
- Successful handoffs persist an encrypted deal-to-ticket identity and verify
  the live association on every read. Ticket renames remain safe, while the
  stable subject marker repairs missing mappings and ignores unrelated tickets.
- Ticket creation uses the configured HubSpot pipeline and stage.
- A failed ticket-to-deal association triggers compensating ticket deletion.
- Workflow callback IDs are claimed atomically for seven days and released on
  failure.
- The workflow action uses the same evaluation and ticket-creation service as
  the card and returns status, missing count, and ticket ID.
- Settings load native HubSpot ticket pipelines and stages rather than asking
  operators to type internal IDs.
- Required deal properties use HubSpot's native labels and multi-select, and the
  API rejects stale properties, pipelines, or stages before saving.
- Settings and ticket creation enforce a portal-scoped, default-deny user policy;
  UI surfaces expose read-only capability state before mutation.
- Card and workflow ticket creation share one atomic portal/deal mutation claim,
  preventing duplicate tickets across concurrent entry points.
- Overview evaluation is bounded to three concurrent deals, HubSpot calls time
  out after ten seconds, and all Node adapters reject bodies over 1 MiB.
- Automation JSON endpoints reject unsupported media types after signature
  verification.
- Overview requirement counts exclude the ticket action and explain the next
  step in plain language.
- The app page links each closed-won deal back to its HubSpot record.
- The app page and card link directly to the associated handoff ticket.

## Local evidence

The embedded runtime's 33 tests, product API's 26 tests, and app-page model's
four tests pass. All TypeScript surfaces pass typechecking, and SpotKit reports
zero errors. The only diagnostic warning is the intentionally reserved
`handoffready.example.com` origin.

The local Node adapter was exercised on port 8791 and exposed through an
ephemeral Cloudflare quick tunnel:

- public `GET /health` returned 200 with the HandoffReady service identity;
- public `GET /oauth/install` returned a no-store 302 containing the four
  documented OAuth scopes and the intentionally local development callback;
- an uninstalled portal request to `GET /api/handoffs` failed closed with 401;
- a webhook POST without JSON content type returned 415 and `no-store`.

## Remaining external evidence

Before release:

1. replace the placeholder origin with an operator-owned HTTPS deployment;
2. install the OAuth app in a test portal and configure a real ticket pipeline;
3. render and exercise the app page, deal card, settings, ticket association,
   workflow retry, and empty/error/loading states in authenticated HubSpot;
4. capture reviewed screenshots and run `spotkit docs-refresh`;
5. activate webhook subscriptions only after deployed duplicate/retry behavior
   is observed;
6. run `spotkit release-check --hubspot`, deploy the reviewed build, and run the
   public smoke test.

The Chrome extension refused both local addresses and the temporary
`trycloudflare.com` URL with a client-side block. The same public HTTPS endpoint
was verified over HTTP, but no rendered-browser claim or screenshot is recorded.
