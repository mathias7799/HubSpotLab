# Smoke testing a deployed app

SpotKit separates public boundary checks from authenticated UI verification.
Run both before promoting a HubSpot build.

## Automated public checks

Point the command at the deployed API origin, not the HubSpot UI URL:

```bash
pnpm spotkit smoke https://api.my-app.com
```

The command verifies the health response, locked-down installed page headers,
HubSpot OAuth authorization redirect, and secure OAuth state cookie. It does
not install the app, mutate CRM data, or follow the OAuth redirect.

## Authenticated browser recipe

Use a non-production HubSpot test account and a clean browser profile:

1. Run `pnpm spotkit reconnect projects/my-app` and review the printed URL.
2. Open it deliberately with `pnpm spotkit reconnect projects/my-app --open`.
3. Approve the requested scopes for the test account and confirm the callback
   reaches the deployed `/installed` page.
4. Open the app page, CRM card, and native settings page in HubSpot.
5. Confirm the app page reports the same portal as the browser session.
6. Save and reload settings, then verify the values remain portal-specific.
7. Exercise every installed feature using its guide under `docs/features`.
8. Confirm another test portal cannot read the first portal's installation or
   settings.

For webhooks and workflow actions, repeat the same HubSpot event once and
verify the receiver acknowledges the retry without repeating the side effect.
For an app object, verify the project contains exactly one schema before
creating test records.

Record the HubSpot account ID, build ID, application version, browser, and test
time in the release notes. Never capture access tokens, cookies, private keys,
or customer data in screenshots or logs.

Import reviewed PNG screenshots into the project documentation with:

```bash
pnpm spotkit docs-refresh projects/my-app \
  --screenshot "App overview=./captures/overview.png" \
  --screenshot "CRM card=./captures/card.png" \
  --confirm
```

SpotKit strips common PNG metadata and rebuilds the screenshot gallery and hash
manifest. Use the same arguments with `--check` to detect drift without writing.

## Release order

```bash
pnpm spotkit release-check projects/my-app --hubspot
pnpm spotkit upload projects/my-app --confirm --message "Release candidate"
pnpm spotkit smoke https://api.my-app.com
```

`upload` only creates a HubSpot build. Review and deploy that build separately,
then run the smoke checks against the deployed API and complete the browser
recipe before production promotion.
