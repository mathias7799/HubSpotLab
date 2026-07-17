# SpotKit hosting

SpotKit generates one web-standard application and three production entry
points. `pnpm build` bundles each entry with esbuild for Node.js 24.

## Generic Node and containers

`dist/node.js` starts the API on `PORT`. The multi-stage Dockerfile copies only
bundled JavaScript, runs as the unprivileged `node` user, and health-checks
`/health`.

```bash
pnpm build
docker build -t my-spotkit-app .
docker run --env-file services/api/.env -p 8788:8788 my-spotkit-app
```

## AWS Lambda

`dist/aws-lambda.js` exports an API Gateway HTTP API payload-v2 handler. It
preserves raw queries, binary bodies, browser cookies, and multiple response
cookies. The SAM template declares Node.js 24 and root plus proxy routes.

```bash
pnpm build
sam build --template-file services/api/deploy/aws-sam.yaml
sam deploy --guided
```

## Azure Functions

`dist/azure.js` registers an anonymous catch-all HTTP trigger. HubSpot requests
remain protected by signature v3; OAuth routes use signed state and a bound
browser cookie.

```bash
pnpm build
cd services/api
func start
```

For every production target, configure the public HTTPS origin, HubSpot OAuth
credentials, a unique encryption secret, paired Upstash REST credentials, and
`ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS=false` in the provider's secret store.
