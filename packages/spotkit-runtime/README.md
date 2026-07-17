# SpotKit runtime

`@hubspotlab/spotkit-runtime` is the portable security boundary used by
SpotKit-generated HubSpot apps. It provides:

- OAuth authorization, callback, signed state, and browser-cookie binding;
- per-portal access-token lookup and coalesced refresh;
- HubSpot request signature v3 verification;
- AES-256-GCM encrypted Upstash token storage;
- an in-memory store and unsigned-request mode restricted to localhost;
- web-standard `Request`/`Response` routing independent of a hosting vendor.

## Use

```ts
import { createSpotKitRuntime } from "@hubspotlab/spotkit-runtime";

export const app = createSpotKitRuntime({
  appName: "My app",
  namespace: "my-app",
  requiredScopes: ["oauth", "crm.objects.deals.read"],
  createApi:
    ({ accessTokenForPortal, verifyRequest }) =>
    async (request) => {
      // Domain routes stay here. Verify HubSpot UI requests before using the
      // installation token returned by accessTokenForPortal.
      return Response.json({ ok: true });
    },
}).app;
```

Production startup fails unless `PUBLIC_URL` uses HTTPS, the encryption key is
at least 32 characters, and both Upstash REST variables are set. See the
[SpotKit guide](../../tools/spotkit/README.md) for the generated project flow.

## Validate

```bash
pnpm --dir packages/spotkit-runtime test
pnpm --dir packages/spotkit-runtime typecheck
```
