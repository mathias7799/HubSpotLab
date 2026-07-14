# TidsHub

TidsHub is a HubSpot-native time-registration product. All deployable surfaces,
services, operational guidance, and product screenshots live together in this
project directory.

## Structure

| Path            | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `apps/hubspot/` | HubSpot OAuth app, app page, CRM card, and settings  |
| `services/api/` | Portable OAuth API for Node, Lambda, Azure, and more |
| `docs/`         | Product architecture, deployment guide, and images   |

The HubSpot app owns the native user experience. The API is deliberately small
and handles OAuth token custody, signed requests, schema provisioning, and CRM
operations that UI extensions cannot perform reliably.

## Commands

Run commands from the repository root:

```bash
pnpm tidshub:api:local
pnpm tidshub:validate
pnpm tidshub:upload
```

Or work directly from this directory:

```bash
pnpm api:local
pnpm validate
pnpm upload
```

See the [HubSpot app guide](apps/hubspot/README.md),
[API guide](services/api/README.md), and
[architecture guide](docs/architecture.md) for component-specific details.
