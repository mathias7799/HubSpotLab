# SpotKit architecture

SpotKit has three boundaries:

1. `src/cli.ts` owns argument parsing, terminal output, and process exit codes.
2. `src/create.ts` owns deterministic template expansion and safe filesystem
   creation.
3. `src/doctor.ts` owns read-only project diagnostics and machine-testable
   results.

The exported create and doctor functions do not write to stdout or terminate
the process. This keeps the core usable from tests, future agent skills, and
other developer tools.

## Template contract

Templates live under `templates/project`. Files ending in `.tpl` lose that
suffix during generation. SpotKit replaces a small explicit token set for the
project slug, safe HubSpot UID, display name, description, API origin, and
support email.

User-controlled values have separate JSON-escaped tokens for JSON and
TypeScript string contexts. Project slugs are restricted to lowercase
kebab-case and output creation fails when the target directory is non-empty.

## Generated trust boundary

The initial template deliberately separates HubSpot-rendered UI from the
portable API. Version 0.1 implements only public API health. OAuth credentials,
request signatures, token storage, and CRM writes will enter through a shared
runtime package in a later milestone, keeping secrets out of UI extensions.

## Diagnostic model

Doctor returns structured diagnostics with `success`, `warning`, or `error`
levels and stable codes. The CLI renders these for humans; future JSON output
and CI annotations can reuse the same report without parsing terminal text.
