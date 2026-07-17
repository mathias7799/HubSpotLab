FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY packages ./packages
COPY services ./services
RUN pnpm install --frozen-lockfile=false
RUN pnpm --dir services/api build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8788
WORKDIR /app
COPY --from=build /app/services/api/dist ./dist
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8788/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/node.js"]
