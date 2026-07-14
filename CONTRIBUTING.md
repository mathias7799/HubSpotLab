# Contributing

## Add a project

Place each product in `projects/<project-name>/`, including its apps, services,
tests, and product-specific documentation. Put cross-project code in
`packages/`, developer utilities in `tools/`, agent extensions in `skills/`,
and runnable demonstrations in `examples/`.

A project should include:

- a short README with purpose, prerequisites, setup, and validation commands;
- local dependency and configuration files;
- an `.env.example` when environment variables are required;
- tests appropriate to its risk and scope;
- clear notes about required HubSpot scopes or external services.

Use kebab-case for directory names. Avoid coupling projects through relative
imports; promote shared code into a versioned package instead.

## Changes

Keep commits focused and use imperative commit subjects. Never commit HubSpot
access tokens, private-app tokens, OAuth secrets, customer data, or generated
environment files.

If a change establishes a repository-wide convention or makes a lasting
architectural tradeoff, add a short decision record under `docs/decisions/`.
