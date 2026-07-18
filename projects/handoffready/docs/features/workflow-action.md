# HandoffReady workflow action

The handoff action posts to `/workflow-actions/prepare-handoff`. Its receiver verifies
HubSpot signature v3, validates workflow context, and atomically deduplicates
callback IDs for seven days. Failures release their claim for HubSpot retries.

The action supports deals and accepts an `evaluate` or `create_ticket` mode.
`route_id` selects any stable portal route; leaving it blank preserves the
primary-route behavior for existing workflows. It returns `status`,
`missing_count`, legacy `ticket_id`, and comma-separated `output_ids`, and uses
the same encrypted settings, idempotency, and compensation behavior as the CRM
card.

It remains `isPublished: false`. Verify a deployed action in a test workflow,
including HubSpot retries and a deliberately blocked handoff, before publishing.
