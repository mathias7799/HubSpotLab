# Associations, labels, projects, and tasks

## Association identity

HubSpot association writes require a valid relationship definition, commonly a
category plus numeric type ID in a specific direction. The display label alone
is insufficient. A type that is valid from deal → contact may differ from the
reverse contact → deal definition.

Before writing:

1. resolve both object types in the target portal;
2. list available association definitions for the ordered pair;
3. match the intended label and category;
4. persist or configure the numeric type ID only when its installation lifecycle
   is understood;
5. verify with a read after write.

Translate “one or more associations are invalid” into the failed source, target,
direction, category, type ID, and portal label rather than showing the raw API
message alone.

## Required labeled relationships

State requirements precisely. For example:

> Deal must have at least one associated company using the Primary label, and
> that company must have a non-empty city property.

Distinguish these failure modes:

- no company association;
- company associations exist but none has the Primary label;
- multiple Primary companies violate cardinality;
- the Primary company exists but city is empty;
- the app lacks permission to read the company or association label.

Labels are relationship metadata, not tags on the target record. Do not model a
“primary” relationship by adding a global property to the company.

## Contextual tasks

When a user selects a deal, contact, company, ticket, or project:

1. query tasks associated with that selected record;
2. show open tasks by default;
3. offer an explicit “include completed tasks” control;
4. preserve task status, due date, owner, and direct link;
5. allow an optional task while retaining the required parent association;
6. fall back to broader search only when the user requests it.

Do not assume a task related to a deal is automatically associated to every
contact or company on that deal. Traverse or write each required relationship
explicitly.

## Link construction

Prefer host-provided navigation actions or supported record URLs with portal and
object context. Verify links for standard objects, activities, projects, and app
objects separately. Never build a user-facing URL from an untrusted object type
or record ID without validation and encoding.
