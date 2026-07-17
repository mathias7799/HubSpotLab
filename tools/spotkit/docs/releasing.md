# Releasing SpotKit

## Application release check

```bash
pnpm spotkit release-check projects/my-app
pnpm spotkit release-check projects/my-app --hubspot
```

Release check treats every doctor warning as blocking, scans release content for
HubSpot private-app tokens and private keys, rejects reserved/example/tunnel
origins in deployable sources, and optionally invokes HubSpot's official project
validator.

Creating a HubSpot build requires explicit confirmation:

```bash
pnpm spotkit upload projects/my-app --confirm --message "Release candidate"
```

Without `--confirm`, SpotKit exits before validation or upload. Upload creates a
HubSpot project build but does not automatically deploy that build.

After separately reviewing and deploying the build, verify its public security
and OAuth boundaries:

```bash
pnpm spotkit smoke https://api.my-app.com
```

Then complete the test-portal walkthrough in the
[smoke-testing guide](smoke-testing.md). It covers authenticated app-page, CRM
card, native-settings, portal-isolation, and installed-feature verification.

## npm package

The SpotKit package embeds its templates and a tested runtime source payload.
Verify the exact registry artifact locally:

```bash
mkdir -p /tmp/spotkit-pack
pnpm --dir tools/spotkit pack --pack-destination /tmp/spotkit-pack
pnpm dlx /tmp/spotkit-pack/hubspotlab-spotkit-*.tgz --version
```

CI installs that tarball outside HubSpotLab, generates a standalone project,
adds webhooks, verifies its lifecycle manifest, upgrade plan, and strict
workspace inventory, installs dependencies, runs tests and typechecks, and
builds all hosting targets.

## Publishing

1. Update `tools/spotkit/package.json` and the CLI version together.
2. Update the changelog-facing README and roadmap.
3. Run the complete repository gate and packed-artifact smoke test.
4. Configure the `NPM_TOKEN` repository secret for the `@hubspotlab` npm scope.
5. Push a `spotkit-vX.Y.Z` tag or manually dispatch **Release SpotKit**.

The workflow publishes with npm provenance. It does not publish the embedded
runtime as a separate package; generated projects receive a local workspace
copy and remain independently installable. A tag-triggered release fails before
publication unless `spotkit-vX.Y.Z` exactly matches the package and CLI version.
