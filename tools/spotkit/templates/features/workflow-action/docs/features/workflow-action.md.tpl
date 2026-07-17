# __SPOTKIT_DISPLAY_NAME__ workflow action

The example action posts to `/workflow-actions/example`. Its receiver verifies
HubSpot signature v3, validates workflow context, and atomically deduplicates
callback IDs for seven days. Failures release their claim for HubSpot retries.

The action is generated with `isPublished: false`. Customize the input fields,
labels, supported object types, output fields, and `onExampleWorkflowAction`.
Run integration tests before publishing it in HubSpot.
