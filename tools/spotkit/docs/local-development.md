# SpotKit local development

## Prepare secrets

Copy `services/api/.env.example` to the ignored `services/api/.env` and provide
the HubSpot client ID, client secret, encryption key, and any optional scopes.
SpotKit refuses coordinated development without this file instead of starting a
partially configured OAuth service.

## Synchronize an origin

```bash
pnpm spotkit sync-origin https://api.example.com projects/my-app --check
pnpm spotkit sync-origin https://api.example.com projects/my-app
```

The command precomputes all edits before writing. It updates app OAuth metadata,
permitted fetch origins, `.env.example`, the ignored `.env` when present, UI
backend constants, webhook targets, and workflow/agent action URLs. Only HTTPS
origins without paths, queries, or fragments are accepted.

## Coordinated development

```bash
pnpm spotkit dev projects/my-app --check
pnpm spotkit dev projects/my-app
```

The development command starts the API and HubSpot project development process
with inherited output. If either exits or the operator sends SIGINT/SIGTERM,
SpotKit terminates the other process. Use `--api-only` when HubSpot development
is already running elsewhere and `--origin` to synchronize before startup.

## Temporary tunnels

Install either `cloudflared` or `ngrok`, then run:

```bash
pnpm spotkit tunnel projects/my-app --provider cloudflare
pnpm spotkit tunnel projects/my-app --provider ngrok
```

SpotKit waits for the provider's HTTPS URL, synchronizes the project, then
starts the API and HubSpot development. Tunnel processes are supervised with the
other children and are terminated on failure or shutdown. The temporary URL is
not silently reverted: this avoids overwriting edits made during development
and lets `doctor --strict` catch it before release.

## OAuth reconnect

```bash
pnpm spotkit reconnect projects/my-app
pnpm spotkit reconnect projects/my-app --open
```

The first command only prints a reviewable installation URL. Browser launch
requires explicit `--open`; the user still chooses and authorizes the target
HubSpot account in HubSpot's OAuth UI.
