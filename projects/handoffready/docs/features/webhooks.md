# HandoffReady webhooks

The receiver at `POST /webhooks/hubspot` verifies HubSpot signature v3 against
the exact raw body, accepts batches of up to 100 events, and uses an atomic
seven-day idempotency claim. Failed handlers release their claim so HubSpot can
retry them.

Deal-creation and deal-stage-change subscriptions are intentionally inactive.
The handler records minimal lifecycle context without CRM writes. Test signed
batches, duplicate delivery, retries, and production log handling before
activating either subscription.

Keep webhook work short. Queue expensive processing and return a success
response before HubSpot's timeout.
