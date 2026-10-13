# Dimension (financial-analysis dimensions)

The shared financial-analysis capability (promoted from AR 2026-08-25, same tier as Tax): company-wide analysis dimensions ('Department', 'Project', 'Cost Centre', ...) and their option values, consumed by AR today and AP / GL / PO later.
The same Department list must mean the same thing on every module's documents - that is why the catalog is owned by nobody's sub-module.

- **Module folder:** `src/modules/dimension`
- **Gateway base:** `/api/dimension` (setup CRUD; the Setup screen currently gates on the AR menu `/ar/analysis` and relocates when a second consumer arrives)
- **Schema:** `dimension` (registered in `platform/schemas.js`)
- **Seam:** `platform/dimensionGateway.js` - consumers never `require()` the models.
- **Entitlement:** there is NO `requireModule()` on this router - the setup routes gate on `verifyToken` + `requireMenuAction('/ar/analysis')` only (the menu grant is the gate; whichever module owns the menu owns the entitlement).
- **Request validation:** every route that reads a request part mounts a Zod validator; the validators are exported from the controller itself (`validateCategoryCreate`, `validateCategoryUpdate`, `validateOptionCreate`, `validateOptionUpdate`, `validateSetActive`, `validateCopy`, `validateCopySource`) rather than from a separate schemas file.

## The hybrid model (locked in with the user 2026-08-25)

Unlimited catalog, bounded stamping, column-based reporting:

- `dimension.DimensionCategory` - a dimension: `companyId`, `name`, `dimensionNo` (the **Analysis Dimension number 1..6**, partial-unique per company, NULL = catalog-only), `displaySeq` (1..999, entry display order), `parentCategoryId` (self-FK, hierarchy), `isActive`, stamps.
  The user-facing wording is "Analysis Dimension" / "Dimension 1-6" (user decision 2026-08-25; the column was `slotNo` for one day, renamed by a guarded boot migration in `app.js`).
  `dimensionNo` is company-GLOBAL: Dimension 3 means the same thing in every consuming module, which is what makes cross-module reporting joinable by number.
  Enable/disable only, no deletes.
- `dimension.DimensionCategoryModule` - **per-module applicability** (user decision 2026-08-27): `companyId`, `categoryId` (FK), `moduleId`, `isRequired`, stamps; unique `(categoryId, moduleId)`.
  One row per (category, module), presence = applicable (opt-in), each row carrying its OWN `isRequired` (manual entry in that module must pick a value; system producers exempt).
  The category-level `isRequired` was retired the same day so "is Department mandatory?" has exactly one answer per module; a guarded boot migration in `app.js` reads the old flag before the alter-sync drops it and seeds one AR row per numbered dimension (keyed on the module with `code = 'AR'`).
  `moduleId` is the Control-Plane `Module.id` as a plain UUID (peer service, no FK), resolved from the frozen module CODE consumers already pass to `requireModule` (`'AR'`), through `dimensionGateway.resolveModuleId`.
  Two rules: a dimension WITH a number must apply to at least one module (else it burns one of the six slots with nothing able to write it), and a catalog-only dimension applies nowhere by definition.
  Unticking a module that already has stamped documents is allowed and needs no lock - unlike a `dimensionNo` change it only stops NEW entry; existing documents keep their option ids and every report still resolves.
- **Hierarchy** (user decision 2026-08-27): `DimensionCategory.parentCategoryId` makes a dimension a level under another (Department under Division, 1:many), and `DimensionOption.parentOptionId` says which parent option each value belongs to.
  Both levels are stamped in their own `analysis<N>Id` column, so history is FROZEN (a Department later moved to another Division does not rewrite last year's reports) and every level stays a one-column `GROUP BY`.
  `parentCategoryId` is deliberately UNRELATED to `dimensionNo`: the number is a physical storage slot, the link is semantic, so Division may be Dimension 5 and Department Dimension 2.
  Depth is unbounded because each level owns a column; the six-slot ceiling is the natural brake.
  Rules: no self-parent and no cycles; a stamped child needs a stamped parent; module applicability NESTS (a parent must cover every module its child covers); an option's parent must belong to the declared parent category.
  Repointing a category's parent clears every option link at once (they addressed the old parent's options) and the response reports the count; reparenting a single option touches nothing else.
  An option left unlinked under a parented category is UNASSIGNED: kept and listed on the setup screen under its own group, but withheld from entry pickers, since the cascade has no level to file it under.
- `dimension.DimensionOption` - the values: `companyId`, `categoryId` (real intra-service FK), `parentOptionId` (self-FK), `code` (unique per category), `description`, `isActive`, stamps.
  Consuming documents reference options **by id** through their own `analysis<dimensionNo>Id` columns, so renames are free and history never strands.
- Consumers own their stamping columns and indexes (e.g. `ar.Ledger.analysis1Id..analysis6Id` with partial indexes `(analysisNId, trxDate) WHERE NOT NULL` - only tagged rows are indexed, so the sparse NULL majority costs nothing and reports stay a one-column `GROUP BY`).

## The gateway (`platform/dimensionGateway.js`)

Exports: `ANALYSIS_COLUMNS`, `registerConsumer`, `consumerModuleCodes`, `resolveModuleId`, `availableModules`, `dimensionInUse`, `entryMeta`, `readSelections`, `copyColumns`, and the re-exported `internalServiceUrl`.
Every call that names a module takes the frozen `Module.code` (`'AR'`), the same string the consumer passes to `requireModule`.

- `entryMeta(companyId, moduleCode)` - the number-assigned active categories **that module applies to** + active options, for entry-dialog pickers; `isRequired` is that module's own flag.
  Each row also carries `displaySeq` (user request 2026-08-31): the entry dialogs render explicitly sequenced dimensions first (ascending), then the rest in automatic parent-before-child order.
  Pure presentation - freely editable on the Setup screen, no repurpose lock.
- `readSelections(companyId, body, moduleCode)` - validates a manual entry's `body.analysis` (`{ "<dimensionNo>": optionId }`): the dimension applies to the CALLING module, option of that category + active, that module's `isRequired` enforced; returns the six `analysis<N>Id` column values.
  A dimension the module cannot stamp is rejected, not dropped - hiding in the UI is never the gate.
  Ancestors a picked child determines are DERIVED and stamped (pick the Department, get its Division), so the pair is never half-frozen, and required is checked after derivation; a pair the clerk picked inconsistently is rejected.
- `copyColumns(row)` - the six columns of an existing row, for copies (e.g. AR void reversals, or a producing module handing its stamps to the AR ledger).
  Deliberately UNFILTERED by applicability: applicability governs data ENTRY, not what a row may carry, or restricting a dimension from AR would silently strip analysis off AR rows another module legitimately created.
- `availableModules(companyId)` - the modules the Setup screen may offer: registered consumers INTERSECTED with the company's subscribed modules (`serviceContext.getTenantModuleCatalog` + `getCompanyModuleIds`, per-request memoized).
  A module appears only once it is wired in `src/wiring/dimensionUsage.js`, so every checkbox on that screen changes behaviour somewhere.
- `registerConsumer({ moduleCode, usageCheck })` / `consumerModuleCodes()` / `resolveModuleId(moduleCode)` / `dimensionInUse(...)` - **the repurpose lock's eyes** plus the module identity: the dimension service cannot query consumers' tables, so each consumer registers at composition time (`src/wiring/dimensionUsage.js`; AR checks its `analysis<N>Id` columns).
  Every consumer is asked, applicable or not - a module unticked last month still has documents pointing at the dimension.
  Once any consumer's document references a category's options, its `dimensionNo` can no longer change (rename stays free) - disable and create a new dimension instead.
  WHEN SPLIT: the checks become internal HTTP endpoints the dimension service calls.

## Public API (gateway seam `/api/dimension`)

All behind `verifyToken` + `requireMenuAction('/ar/analysis')` (POST = create, PUT/PATCH = edit per the method mapping):

- `GET /health` - liveness (unauthenticated).
- `GET /` - the company's catalog: categories with their options, module rows and the available modules.
- `POST /categories` · `PUT /categories/:id` · `PATCH /categories/:id` (`isActive`) - the dimension header (name, dimension number, display sequence, parent, module applicability with per-module required).
- `POST /options` · `PUT /options/:id` · `PATCH /options/:id` (`isActive`) - the values.
- `GET /copy-sources` · `GET /copy-sources/:companyId` · `POST /copy` `{ sourceCompanyId, ids }` - copy from another company (2026-09-07; sources = companies the caller holds an active membership in via `listCallerCompanies`, preview-then-select, skip-never-overwrite; see account-receivable.md for the adaptation rules).

## Consumers

- **Account Receivable** (2026-08-25): manual Invoice/DN/CN entry renders one picker per dimension that applies to AR (account meta ships `analysis`), drafts re-stamp on edit, void reversals copy the columns, `postLedgerDoc` accepts `analysisColumns` for future producer pass-through, and the interest run freezes run-level picks on `ar.Interest` and stamps them onto the posted interest document.
  Every gateway call passes the module code `'AR'` (`AR_MODULE` in the AR controllers).
  See account-receivable.md.
- AP / GL / PO: future - each adds its own `analysis<N>Id` columns + partial indexes and registers a usage check.
