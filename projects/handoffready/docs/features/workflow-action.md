# HandoffReady workflow action

The handoff action posts to `/workflow-actions/prepare-handoff`. Its receiver verifies
HubSpot signature v3, validates workflow context, and atomically deduplicates
callback IDs for seven days. Failures release their claim for HubSpot retries.

The action supports deals and accepts an `evaluate` or `create_ticket` mode. It
returns `status`, `missing_count`, and `ticket_id`, and uses the same encrypted
portal settings and compensation behavior as the CRM card.

It remains `isPublished: false`. Verify a deployed action in a test workflow,
including HubSpot retries and a deliberately blocked handoff, before publishing.
