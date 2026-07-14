# Projects

Each product lives in `projects/<project-name>/` and owns its deployable apps,
supporting services, tests, documentation, screenshots, and release commands.

Use this shape when a product has more than one runtime:

```text
projects/example/
├── apps/       # HubSpot projects, web apps, or other user-facing surfaces
├── services/   # APIs, workers, and integration services
├── docs/       # Product-specific architecture and operations
├── package.json
└── README.md
```

Code shared by multiple projects belongs in `packages/`. Repository-wide
conventions and architectural decisions belong in `docs/`.
