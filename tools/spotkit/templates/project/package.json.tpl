{
  "name": "@spotkit-generated/__SPOTKIT_SLUG__",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@11.6.0",
  "scripts": {
    "test": "pnpm --filter '@spotkit-generated/__SPOTKIT_SLUG__-api' test",
    "typecheck": "pnpm --filter '@spotkit-generated/__SPOTKIT_SLUG__-api' typecheck && pnpm --dir apps/hubspot/src/app/pages typecheck && pnpm --dir apps/hubspot/src/app/cards typecheck && pnpm --dir apps/hubspot/src/app/settings typecheck"
  }
}
