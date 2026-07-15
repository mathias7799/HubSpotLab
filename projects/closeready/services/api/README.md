# CloseReady API

This package contains the HubSpot gateway and a web-standard `Request` to
`Response` handler. The same handler can be wrapped by Node, AWS Lambda, Azure
Functions, or HubSpot serverless adapters.

Implemented capabilities:

- provision the single `closeready_rule` custom object;
- discover deal pipelines and deal/contact/company properties;
- discover HubSpot deal-to-contact and deal-to-company association labels;
- create, list, update, and archive rules;
- collect current deal, association, and metric data;
- evaluate a proposed stage transition;
- update the deal stage only after a guarded evaluation passes.

The package deliberately injects `accessTokenForPortal` and `verifyRequest`.
Deployment adapters are responsible for OAuth, encrypted token persistence, and
HubSpot signature v3 verification. This keeps credentials out of CRM and keeps
the business layer portable.
