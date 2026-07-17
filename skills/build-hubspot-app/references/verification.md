# Verification gates

## Every change

```bash
pnpm spotkit doctor <project> --strict
pnpm --dir <project> test
pnpm --dir <project> typecheck
```

Run formatting and lint commands defined by the repository or project.

## HubSpot component changes

```bash
cd <project>/apps/hubspot
hs project validate
```

Use an authenticated HubSpot test account to verify the app page, record card,
settings, associations, permissions, and empty/error/loading states. Do not use
validator success as proof that gated features are approved or installed.

## Portable API changes

Test OAuth state/cookies, token refresh, tenant isolation, signature v3,
idempotency, encryption, production storage requirements, and each hosting
adapter affected by the change.

After deployment:

```bash
pnpm spotkit smoke https://api.example.com
```

## Release

```bash
pnpm spotkit release-check <project> --hubspot
pnpm spotkit upload <project> --confirm --message "Release candidate"
```

Upload creates a build and never deploys it. Review the build, deploy it
separately, complete authenticated browser testing, and record build/account
evidence without tokens, cookies, keys, or customer data.
