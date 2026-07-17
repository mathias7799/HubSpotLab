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
- Existing associated tickets make handoff completion idempotent.
- Ticket creation uses the configured HubSpot pipeline and stage.
- A failed ticket-to-deal association triggers compensating ticket deletion.
- Workflow callback IDs are claimed atomically for seven days and released on
  failure.
- The workflow action uses the same evaluation and ticket-creation service as
  the card and returns status, missing count, and ticket ID.
- Settings load native HubSpot ticket pipelines and stages rather than asking
  operators to type internal IDs.
- Settings and ticket creation enforce a portal-scoped, default-deny user policy;
  UI surfaces expose read-only capability state before mutation.
- The app page links each closed-won deal back to its HubSpot record.

## Local evidence

The project API and embedded runtime tests pass, all TypeScript surfaces pass
typechecking, and SpotKit reports zero errors. The only diagnostic warning is
the intentionally reserved `handoffready.example.com` origin.

The local Node adapter was also exercised on port 8790:

- `GET /health` returned 200 with the HandoffReady service identity;
- `GET /oauth/install` returned a no-store 302 containing the four documented
  OAuth scopes and the local callback;
- an uninstalled portal request to `GET /api/handoffs` failed closed with 401.

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

The in-app browser surface was unavailable during the local verification run,
so no rendered-browser claim or screenshot is recorded here.
