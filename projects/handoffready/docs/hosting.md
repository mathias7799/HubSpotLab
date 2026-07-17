# HandoffReady hosting

Build the generic Node, AWS Lambda, and Azure Functions entry points:

```bash
pnpm build
```

## Container or generic Node

```bash
docker build -t handoffready .
docker run --env-file services/api/.env -p 8788:8788 handoffready
# Without Docker: node services/api/dist/node.js
```

## AWS Lambda

```bash
sam build --template-file services/api/deploy/aws-sam.yaml
sam deploy --guided
```

## Azure Functions

```bash
cd services/api
func start
```

Configure `PUBLIC_URL`, HubSpot OAuth credentials, `TOKEN_ENCRYPTION_KEY`, both
Upstash variables, and `ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS=false` in the
provider's secret store.
