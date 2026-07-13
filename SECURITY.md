# Security policy

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities or exposed
credentials. Report them privately through GitHub Security Advisories for this
repository. Include the affected component, reproduction steps, and the impact
you observed.

## Supported versions

HubSpotLab is currently pre-1.0. Security fixes are applied to the latest
revision on `main`.

## Secrets and test data

- Never commit OAuth secrets, access tokens, refresh tokens, portal exports, or
  customer data.
- Use a dedicated HubSpot developer test account for local and browser tests.
- Rotate a credential immediately if it appears in a terminal log, screenshot,
  issue, or commit.
- Production TidsHub deployments must use the encrypted durable token store.
  The in-memory store and unsigned requests are local-development features.
