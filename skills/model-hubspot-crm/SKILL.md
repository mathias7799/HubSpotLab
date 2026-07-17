---
name: model-hubspot-crm
description: Design and review HubSpot CRM data models across standard objects, activities, properties, pipelines, app/custom objects, associations, labels, and project/task relationships. Use when Codex must decide where HubSpot app data belongs, fix invalid associations, model required labeled relationships, query associated tasks or projects, define object schemas and scopes, migrate CRM data safely, or enforce HubSpotLab's maximum of one app object per project.
---

# Model HubSpot CRM

Design from user workflows and queries, not from a desire to create a schema.
Prefer native CRM concepts and the smallest durable model that supports the
product.

## Establish the portal vocabulary

1. Read project instructions, product workflows, current HubSpot metadata, and
   any checked-in schemas.
2. Inventory every object, property, association, label, pipeline, stage, and
   activity the app reads or writes.
3. Identify the authoritative internal names and object type identifiers from
   the target portal or checked-in metadata. Do not infer them from UI labels.
4. List the required access patterns:
   - records created and updated;
   - records searched and filtered;
   - relationships traversed in each direction;
   - data summarized, approved, audited, or deleted;
   - links users need back to HubSpot records.
5. Capture account entitlements and granted OAuth scopes before selecting app or
   custom objects.

Read [references/object-selection.md](references/object-selection.md) before
choosing storage. Read
[references/associations-and-tasks.md](references/associations-and-tasks.md)
for relationship design or task/project behavior.

## Produce the model

For each entity, specify:

- object or activity type and authoritative identifier;
- ownership and lifecycle;
- properties with internal name, type, nullability, options, and validation;
- unique/display fields and archive behavior;
- associations in both directions, including category, type ID, and label;
- search/filter/sort needs and expected record volume;
- required scopes and entitlement;
- retention, deletion, and migration behavior.

Use exactly one app object at most in a SpotKit project. Do not disguise multiple
logical tables as multiple schemas. Prefer records plus properties, associations,
or encrypted configuration when they meet the access patterns.

## Validate associations before UI work

An association is not defined by two object names alone. Verify:

- the source and target object type identifiers;
- the correct direction;
- the association category and numeric type ID;
- whether the label is HubSpot-defined, user-defined, or app-defined;
- whether the intended label exists in the installed portal;
- whether archived records and completed activities should be included.

Design dependent selection from existing relationships. If a user selects a
deal, contact, company, ticket, or project, query its associated tasks first;
make global search a deliberate fallback. Keep “include completed tasks” an
explicit filter.

## Plan safe evolution

Read [references/schema-evolution.md](references/schema-evolution.md) before
changing deployed properties, labels, pipelines, or object schemas. Separate:

1. additive metadata;
2. data backfill;
3. reader compatibility;
4. writer cutover;
5. cleanup after rollback is no longer needed.

Never rename an internal property or association by changing only its display
label. Never delete or repurpose a field until production usage and rollback
requirements are known.

## Verify from both API and host UI

Test representative records with no associations, one association, multiple
labels, archived targets, closed/open tasks, missing optional properties, and
permission failures. Confirm both API traversal and authenticated HubSpot UI
links. Treat schema creation success as separate from record and association
authorization.

Return a concise model diagram or table, access patterns, scopes/entitlements,
migration sequence, invariants, and unresolved portal-specific identifiers.
