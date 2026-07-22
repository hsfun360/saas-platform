---
name: data-model
description: >-
  Refresh docs/data-model.md so it matches the current Sequelize models and
  associations in apps/api (creates the doc on first run). Use whenever the user
  asks to update, regenerate or check the data model doc or ERDs, after models or
  associations changed, after a new module/table/schema was added, or when a data
  model diagram is requested.
---

# Data Model Doc Refresher

Keep `docs/data-model.md` in sync with the real Sequelize models.
The model files are the source of truth; the doc is a curated map, never an invention.

## Sources of truth (read before writing)

1. **Association wiring**: `apps/api/src/wiring/associations.js` - every association is defined exactly once here.
   Read it fully, including comments: they record the microservice seams, the deliberate NON-associations (cross-service UUID value refs), and cascade decisions.
2. **Entity inventory**: glob `apps/api/src/modules/**/*.model.js` plus `apps/api/src/platform/outboxMessage.model.js`.
   Do NOT enumerate entities from `associations.js` alone - standalone singletons (e.g. `MembershipSetting`, `PlatformProfile`) are not required there.
3. **Physical schemas**: `apps/api/src/platform/schemas.js` - which Postgres schema each product service owns (`membership`, `golf`, `tax`; platform tables stay in `public`).
4. **Business context**: `apps/api/docs/systems/*.md` - the service map, golden rules, and vocabulary.
   Use its service names and terminology in the doc.

## Refresh procedure

1. Re-survey the entity inventory (glob above) and diff it against the doc's domain map.
   Note new/removed modules and models, and relationship changes on the hub entities (Account, Company, User, Module/Menu, Role, Membership, Member, Course, TaxScheme).
2. Update `docs/data-model.md` **in place**: keep the conventions + section structure; refresh the domain map and the per-domain ERDs (Mermaid `erDiagram`) to match real relationships.
   Keep ERDs limited to load-bearing relationships - the entity files remain the source of truth for full column lists.
3. Draw the two relationship kinds differently, matching golden rule 2 of the systems catalog:
   - Real Sequelize association (intra-service FK) - solid line, e.g. `MembershipFee ||--o{ MembershipFeeScheme : "stages (cascade)"`.
   - Cross-service or association-less UUID/value reference - dashed (non-identifying) line, e.g. `Membership }o..|| Company : "companyId (value ref)"`.
4. Keep standalone tables (reference data, singletons, queue tables) out of the diagrams; list them in the domain map with a "standalone" note instead.
5. Mark anything inferred rather than read from code with `_(confirm)_`; don't invent.
6. If `docs/data-model.md` does not exist yet, create it with the section structure below.
7. End with a short summary of what changed (or "no changes needed").

## Doc structure (keep stable across refreshes)

1. Header note: maintained by this skill, sources of truth, last-refreshed date.
2. **Conventions** - the schema-wide rules (one owner per table, UUID value refs across seams, Postgres schema per product service, platform NULL-discriminator (`accountId NULL` = platform row), money `numeric(21,2)`, RBAC record stamps).
3. **Domain & schema map** - one table: module folder, Postgres schema, service doc, entities (flag standalone ones).
4. **ERDs** - one `erDiagram` per domain group; currently: Control Plane & Identity, Membership, Golf, Tax & platform services.
   Add a group when a new module lands its first associated models.

## Writing rules

Follow `docs/working-conventions.md`: each sentence on its own line, plain hyphens (no em dash).
Do not commit unless the user asks.
