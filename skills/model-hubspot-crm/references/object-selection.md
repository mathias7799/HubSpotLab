# Object and storage selection

## Selection order

1. Use an existing standard CRM object when the record is genuinely that thing.
2. Use an activity such as a task when the lifecycle and host UI should behave
   like that activity.
3. Add a property when the value has one owner record and does not need its own
   lifecycle or many-to-many relationships.
4. Add an association when two records have independent lifecycles and the
   relationship itself matters.
5. Use the single app-object allowance when the app owns a repeatable,
   portal-visible record type that needs CRM search and associations.
6. Use encrypted external/configuration storage for installation secrets,
   portable settings, transient idempotency, or data that does not belong in the
   customer's CRM model.

## Standard and activity objects

Contacts, companies, deals, tickets, products, line items, quotes, owners,
projects, and activities have different APIs, properties, association support,
archive behavior, and entitlements. Confirm support for the exact object and
operation instead of generalizing from deals or contacts.

Tasks are activities, not generic child rows. Store task state in supported task
properties, query through associations, and preserve the direct HubSpot task
link when presenting it in an app.

## App and custom objects

Custom-object availability is entitlement-dependent. App objects are distributed
as app components and may require HubSpot approval. In HubSpotLab/SpotKit:

- define at most one app object per project;
- give it a stable uppercase internal name and a real primary display property;
- associate it only after the object metadata exists;
- keep OAuth installations outside it;
- verify schema, object read/write, and association scopes independently;
- provide a portable alternative when the product must work without the required
  object entitlement.

## Properties

Choose types from actual query and validation behavior. Do not store numbers,
dates, booleans, or enumerations as free text merely for convenience. Define
enumeration internal values as stable API contracts; labels may change.

Separate user-visible state from operational metadata. Include ownership,
created/updated timestamps, versioning, and external identifiers only when the
workflow needs them. Avoid copying standard CRM data into app-owned properties
unless a documented snapshot is required.
