# Monorepo architecture

HubSpotLab uses a collection-of-projects model: the repository provides shared
organization and conventions, while each project remains independently usable.

## Principles

1. **Self-contained projects.** Runtime dependencies, commands, configuration,
   and tests belong to the project that uses them.
2. **Explicit sharing.** Code used by multiple projects moves into `packages/`
   with a documented interface instead of being copied or imported by path.
3. **Secrets stay external.** Commit examples and schemas, never credentials or
   real portal data.
4. **Tooling follows demand.** Add workspace managers, task runners, and CI
   only when active projects benefit from them.
5. **HubSpot boundaries are visible.** Apps and tools document scopes, APIs,
   rate-limit assumptions, and supported authentication modes.

## Dependency direction

Apps and tools may depend on packages. Examples may depend on apps, tools, or
packages for demonstration purposes. Packages must not depend on apps, tools,
or examples. Documentation and skills may reference any project but should not
be required at runtime.
