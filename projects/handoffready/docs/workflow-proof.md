# HandoffReady workflow proof

HandoffReady is the first new product created after HubSpotLab introduced its
five-skill agent lifecycle and SpotKit 0.7. It is evidence for the workflow, not
a claim that deployment-only behavior has been verified.

## Architecture decision

- Profile: OAuth marketplace app with a portable API.
- Surfaces: app page, deal sidebar card, native settings, webhook receiver, and
  unpublished deal workflow action.
- Storage: encrypted portal configuration and OAuth installation storage.
- CRM model: existing deals, companies, contacts, tickets, tasks, and projects;
  zero custom objects with Upstash or one encrypted HubSpot configuration object.
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
- Portal settings contain up to 12 independently configurable department
  routes. Each route controls its fields, associations, output type,
  pipeline/stage, record prefix, and optional project task plan.
- Structured task templates control name, description, status, priority,
  due-date offset, and optional HubSpot owner or queue assignment while
  migrating legacy task-name arrays. Both Tasks and Project + tasks routes can
  create up to 20 ordered templates.
- Successful handoffs persist an encrypted deal/route-to-output identity.
  Ticket routes use route-specific subject markers so one department's ticket
  cannot satisfy another route.
- Ticket, standalone task, and project + task-plan creation use native HubSpot
  records and link every output to the source deal.
- A failed ticket-to-deal association triggers compensating ticket deletion.
- Workflow callback IDs are claimed atomically for seven days and released on
  failure.
- The workflow action can select a route ID, uses the same creation service as
  the card, and returns status, missing count, legacy ticket ID, and output IDs.
- Settings load native HubSpot ticket and project pipelines/stages rather than
  asking operators to type internal IDs.
- Required deal properties use HubSpot's native labels and multi-select, and the
  API rejects stale properties, pipelines, or stages before saving.
- Native HubSpot Super Admins can configure their portal after server-side
  verification; an explicit default-deny policy supports delegated operators.
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

The embedded runtime's 35 tests, product API's 31 tests, and app-page model's
four tests pass. All TypeScript surfaces pass typechecking, and SpotKit reports
zero errors. The only diagnostic warning is the intentionally reserved
`handoffready.example.com` origin.

The local Node adapter was exercised on port 8790 and exposed through an
ephemeral Cloudflare quick tunnel:

- public `GET /health` returned 200 with the HandoffReady service identity;
- public `GET /oauth/install` returned a no-store 302 containing the three
  expanded OAuth scopes and the current HTTPS development callback;
- an uninstalled portal request to `GET /api/handoffs` failed closed with 401;
- a webhook POST without JSON content type returned 415 and `no-store`.

## Remaining external evidence

Before release:

1. replace the placeholder origin with an operator-owned HTTPS deployment;
2. approve the expanded OAuth grant in the test portal and configure real
   ticket/project destinations;
3. render and exercise the app page, deal card, settings, every route type,
   workflow retry, and empty/error/loading states in authenticated HubSpot;
4. capture reviewed screenshots and run `spotkit docs-refresh`;
5. activate webhook subscriptions only after deployed duplicate/retry behavior
   is observed;
6. run `spotkit release-check --hubspot`, deploy the reviewed build, and run the
   public smoke test.

HubSpot build #10 passed official validation, built all six components, and
deployed successfully to developer account `148692688` on 18 July 2026.
Browser control opened the OAuth grant for test portal `148692618` and verified
native Super Admin access. Live
browser tests configured three independent routes and created one ticket, one
standalone task, and one project with two tasks. Every output was associated to
the deal and every card link opened the expected native HubSpot record.

The one-object path is now also live-proved. Portal `148692618` contains exactly
one `handoffready_configuration` object with a unique primary key and
`encrypted_value`. The marketplace token was inspected and contained all three
custom-object scopes. A Customer Success Project + tasks route was saved with
the native Project Pipeline/Planning destination and three ordered templates:
high priority at one day, medium at five days, and low at 30 days. The Node
backend was then terminated and started again with the same encryption key. A
fresh signed `GET /api/settings` returned the project route, pipeline/stage, and
all three templates, proving the configuration came from the encrypted HubSpot
record rather than process memory.
