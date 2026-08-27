# Dimension (financial-analysis dimensions)

The shared financial-analysis capability (promoted from AR 2026-08-25, same tier as Tax): company-wide analysis dimensions ('Department', 'Project', 'Cost Centre', ...) and their option values, consumed by AR today and AP / GL / PO later.
The same Department list must mean the same thing on every module's documents - that is why the catalog is owned by nobody's sub-module.

- **Module folder:** `src/modules/dimension`
- **Gateway base:** `/api/dimension` (setup CRUD; the Setup screen currently gates on the AR menu `/ar/analysis` and relocates when a second consumer arrives)
- **Schema:** `dimension` (registered in `platform/schemas.js`)
- **Seam:** `platform/dimensionGateway.js` - consumers never `require()` the models.

## The hybrid model (locked in with the user 2026-08-25)

Unlimited catalog, bounded stamping, column-based reporting:

- `dimension.DimensionCategory` - a dimension; assigned an **Analysis Dimension number 1..6** (`dimensionNo`, partial-unique per company, NULL = catalog-only) to be stamped on documents.
  The user-facing wording is "Analysis Dimension" / "Dimension 1-6" (user decision 2026-08-25; the column was `slotNo` for one day, renamed by a guarded boot migration in `app.js`).
  `dimensionNo` is company-GLOBAL: Dimension 3 means the same thing in every consuming module, which is what makes cross-module reporting joinable by number.
  `isActive`; enable/disable only, no deletes.
- `dimension.DimensionCategoryModule` - **per-module applicability** (user decision 2026-08-27): which consuming modules offer the dimension, and whether it is mandatory there.
  One row per (category, module), presence = applicable (opt-in), each row carrying its OWN `isRequired` (manual entry in that module must pick a value; system producers exempt).
  The category-level `isRequired` was retired the same day so "is Department mandatory?" has exactly one answer per module; a guarded boot migration in `app.js` reads the old flag before the alter-sync drops it and seeds one Account Receivable row per numbered dimension.
  `moduleId` is the Control-Plane `Module.id` as a plain UUID (peer service, no FK), resolved from the module NAME consumers already pass to `requireModule`.
  Two rules: a dimension WITH a number must apply to at least one module (else it burns one of the six slots with nothing able to write it), and a catalog-only dimension applies nowhere by definition.
  Unticking a module that already has stamped documents is allowed and needs no lock - unlike a `dimensionNo` change it only stops NEW entry; existing documents keep their option ids and every report still resolves.
- `dimension.DimensionOption` - the values (code + description), real intra-service FK to its category, unique code per category.
  Consuming documents reference options **by id** through their own `analysis<dimensionNo>Id` columns, so renames are free and history never strands.
- Consumers own their stamping columns and indexes (e.g. `ar.Ledger.analysis1Id..analysis6Id` with partial indexes `(analysisNId, trxDate) WHERE NOT NULL` - only tagged rows are indexed, so the sparse NULL majority costs nothing and reports stay a one-column `GROUP BY`).

## The gateway (`platform/dimensionGateway.js`)

- `entryMeta(companyId, moduleName)` - the number-assigned active categories **that module applies to** + active options, for entry-dialog pickers; `isRequired` is that module's own flag.
- `readSelections(companyId, body, moduleName)` - validates a manual entry's `body.analysis` (`{ "<dimensionNo>": optionId }`): the dimension applies to the CALLING module, option of that category + active, that module's `isRequired` enforced; returns the six `analysis<N>Id` column values.
  A dimension the module cannot stamp is rejected, not dropped - hiding in the UI is never the gate.
- `copyColumns(row)` - the six columns of an existing row, for copies (e.g. AR void reversals, or a producing module handing its stamps to the AR ledger).
  Deliberately UNFILTERED by applicability: applicability governs data ENTRY, not what a row may carry, or restricting a dimension from AR would silently strip analysis off AR rows another module legitimately created.
- `availableModules(companyId)` - the modules the Setup screen may offer: registered consumers INTERSECTED with the company's subscribed modules.
  A module appears only once it is wired in `src/wiring/dimensionUsage.js`, so every checkbox on that screen changes behaviour somewhere.
- `registerConsumer({ moduleName, usageCheck })` / `dimensionInUse(...)` - **the repurpose lock's eyes** plus the module identity: the dimension service cannot query consumers' tables, so each consumer registers at composition time (`src/wiring/dimensionUsage.js`; AR checks its `analysis<N>Id` columns).
  Every consumer is asked, applicable or not - a module unticked last month still has documents pointing at the dimension.
  Once any consumer's document references a category's options, its `dimensionNo` can no longer change (rename stays free) - disable and create a new dimension instead.
  WHEN SPLIT: the checks become internal HTTP endpoints the dimension service calls.

## Consumers

- **Account Receivable** (2026-08-25): manual Invoice/DN/CN entry renders one picker per dimension that applies to AR (account meta ships `analysis`), drafts re-stamp on edit, void reversals copy the columns, `postLedgerDoc` accepts `analysisColumns` for future producer pass-through.
  Every gateway call passes the module name `'Account Receivable'`.
  See account-receivable.md.
- AP / GL / PO: future - each adds its own `analysis<N>Id` columns + partial indexes and registers a usage check.
