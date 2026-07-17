# Adoption and upgrades

Do not regenerate an existing app over its product code.

1. Establish the baseline:

   ```bash
   pnpm spotkit inspect <project> --json
   pnpm spotkit doctor <project> --json
   pnpm spotkit sync-origin <origin> <project> --check
   ```

2. Align `.env.example` with the app metadata using production-safe defaults.
3. Add the minimal lifecycle manifest only after reviewing it:

   ```bash
   pnpm spotkit manifest <project> --check
   pnpm spotkit manifest <project> --confirm
   ```

4. Review the non-destructive upgrade plan:

   ```bash
   pnpm spotkit upgrade <project> --json
   ```

5. Merge embedded runtime changes manually. Preserve product-owned differences;
   SpotKit deliberately does not overwrite missing, modified, or extra files.
6. Run the adopted product's tests in addition to SpotKit diagnostics.

The lifecycle manifest stores SpotKit schema and version data only. HubSpot
metadata remains authoritative for profile, features, scopes, and origins.
