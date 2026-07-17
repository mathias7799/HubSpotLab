# __SPOTKIT_DISPLAY_NAME__

__SPOTKIT_DESCRIPTION__

This is a SpotKit private-static HubSpot project profile for components that are
not compatible with OAuth marketplace apps, including app functions and SCIM.

```bash
pnpm spotkit features
pnpm spotkit add app-function-endpoint <this-project>
pnpm spotkit add app-function-private <this-project>
pnpm spotkit add scim <this-project>
pnpm spotkit doctor <this-project> --strict
pnpm spotkit release-check <this-project> --hubspot
pnpm spotkit upload <this-project> --confirm --message "Release candidate"
```

`upload` creates a HubSpot build but does not deploy it. Review the build and
test every installed private component in a non-production HubSpot account
before deploying it.

App functions are HubSpot-hosted and optional. SCIM requires HubSpot
Professional or Enterprise, enabled SSO, a verified domain, and allows only one
SCIM app per account.
