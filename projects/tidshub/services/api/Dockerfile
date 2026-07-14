FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY projects/tidshub/package.json projects/tidshub/package.json
COPY projects/tidshub/services/api/package.json projects/tidshub/services/api/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter @hubspotlab/tidshub-api...
COPY projects/tidshub/services/api projects/tidshub/services/api
RUN pnpm --filter @hubspotlab/tidshub-api build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/projects/tidshub/services/api/dist ./dist
EXPOSE 8787
CMD ["node", "dist/adapters/node.js"]
