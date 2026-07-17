# __SPOTKIT_DISPLAY_NAME__

__SPOTKIT_DESCRIPTION__

Generated with
[SpotKit](https://github.com/mathias7799/HubSpotLab/tree/main/tools/spotkit).

## Structure

- `apps/hubspot`: HubSpot app metadata, app page, CRM card, and settings.
- `services/api`: portable web-standard API with a local Node adapter.
- `docs`: product-owned documentation and decisions.

## Start locally

```bash
pnpm --dir services/api dev:local
curl http://localhost:8788/health
```

The generated OAuth callback and fetch origin use `__SPOTKIT_API_ORIGIN__`.
Replace placeholder origins before uploading the HubSpot project.

## Validate

```bash
pnpm test
pnpm typecheck
pnpm spotkit doctor projects/__SPOTKIT_SLUG__
```
