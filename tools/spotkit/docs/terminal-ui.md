# SpotKit terminal UI

Launch the all-in-one project control center from a project or monorepo root:

```bash
pnpm spotkit ui
pnpm spotkit ui projects
```

The terminal UI discovers HubSpot projects recursively and uses the same core
functions as the scriptable CLI. It does not maintain separate state or bypass
the JSON/strict checks used in CI.

## Available actions

- switch between discovered HubSpot projects;
- review profile, platform, features, app-object count, lifecycle, and release
  readiness;
- inspect every doctor diagnostic;
- review lifecycle versions and exact embedded-runtime drift;
- preview and write the minimal lifecycle manifest;
- preview every file affected by public-origin synchronization before writing;
- run local release scans or HubSpot's official validator;
- create a HubSpot build after explicit confirmation, without deploying it;
- review an OAuth reconnect URL before explicitly opening it;
- smoke-test deployed health, browser-security, and OAuth boundaries.

## Safety model

Read-only actions run immediately. Filesystem changes show their complete plan
and require a confirmation that defaults to **no**. OAuth browser launch and
HubSpot build creation also require explicit confirmation. Build creation reruns
strict release and official HubSpot validation; no TUI action deploys a build.

Pressing Escape or Ctrl+C at a prompt cancels the current action. Exiting the UI
does not undo previously confirmed writes, and it never performs an unconfirmed
action during shutdown.
