FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/tidshub-api/package.json apps/tidshub-api/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @hubspotlab/tidshub-api...
COPY apps/tidshub-api apps/tidshub-api
RUN pnpm --filter @hubspotlab/tidshub-api build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/tidshub-api/dist ./dist
EXPOSE 8787
CMD ["node", "dist/adapters/node.js"]
