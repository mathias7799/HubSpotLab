# __SPOTKIT_DISPLAY_NAME__ webhooks

The receiver at `POST /webhooks/hubspot` verifies HubSpot signature v3 against
the exact raw body, accepts batches of up to 100 events, and uses an atomic
seven-day idempotency claim. Failed handlers release their claim so HubSpot can
retry them.

Subscriptions are generated inactive. Edit
`apps/hubspot/src/app/webhooks/webhooks-hsmeta.json`, implement
`onHubSpotWebhookEvent`, test retries, and only then set selected subscriptions
to `active: true`.

Keep webhook work short. Queue expensive processing and return a success
response before HubSpot's timeout.
