{
  "name": "@spotkit-generated/__SPOTKIT_SLUG__-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/adapters/node.ts",
    "dev:local": "PUBLIC_URL=http://localhost:8788 PORT=8788 tsx watch src/adapters/node.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "26.0.0",
    "tsx": "4.20.6",
    "typescript": "5.9.3",
    "vitest": "4.1.8"
  }
}
