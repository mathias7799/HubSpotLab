# Architecture decisions

## Choose the project profile

| Requirement                                                                                 | Shape                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| HubSpot UI only and supported client APIs cover every operation                             | Existing HubSpot project; do not add a backend |
| Marketplace OAuth, durable tokens, cross-portal installation, webhooks, or external actions | SpotKit marketplace profile with portable API  |
| HubSpot-hosted app functions or SCIM                                                        | Separate `private-static` profile              |

Do not use HubSpot serverless/app functions as a required marketplace backend.
They are optional private-profile components and may require higher HubSpot
entitlements.

## Feature catalog

| Feature                             | Profile            | Important boundary                                    |
| ----------------------------------- | ------------------ | ----------------------------------------------------- |
| App page, CRM card, native settings | Marketplace        | Included by default                                   |
| Webhooks                            | Marketplace        | Verify signatures and retry idempotently              |
| Workflow action                     | Marketplace        | Keep unpublished until tested                         |
| App object                          | Marketplace, gated | Maximum one per project                               |
| App-object association              | Marketplace, gated | Add the app object first                              |
| App event                           | Marketplace, gated | Send through authenticated backend                    |
| Agent tool                          | Marketplace, gated | Validate inputs; support agents and workflows         |
| Endpoint/private app function       | Private-static     | Optional HubSpot hosting                              |
| SCIM                                | Private-static     | Check SSO, domain, account, and one-app prerequisites |

Gated components require HubSpot approval. Official project validation proves
metadata shape, not account entitlement or approval.

## Persistence

Prefer encrypted external persistence for OAuth installations because tokens
must remain available before any portal object can be accessed. Use the tested
Upstash adapter for production and memory storage only on localhost.

For portal-owned configuration, use zero app objects by default or exactly one
SpotKit configuration object when the entitlement and scopes permit it. Never
create multiple objects to model rules, logs, or associations that fit records
or encrypted JSON inside the single schema.

## Hosting

Keep domain handlers web-standard. SpotKit supports generic Node, Docker, AWS
Lambda, and Azure Functions from the same API code. Pick the operator's target;
do not make every target a production requirement.
