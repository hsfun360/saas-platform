# Dimension (financial-analysis dimensions)

The shared financial-analysis capability (promoted from AR 2026-08-25, same tier as Tax): company-wide analysis dimensions ('Department', 'Project', 'Cost Centre', ...) and their option values, consumed by AR today and AP / GL / PO later.
The same Department list must mean the same thing on every module's documents - that is why the catalog is owned by nobody's sub-module.

- **Module folder:** `src/modules/dimension`
- **Gateway base:** `/api/dimension` (setup CRUD; the Setup screen currently gates on the AR menu `/ar/analysis` and relocates when a second consumer arrives)
- **Schema:** `dimension` (registered in `platform/schemas.js`)
- **Seam:** `platform/dimensionGateway.js` - consumers never `require()` the models.

## The hybrid model (locked in with the user 2026-08-25)

Unlimited catalog, bounded stamping, column-based reporting:

- `dimension.DimensionCategory` - a dimension; assigned a **slot 1..6** (`slotNo`, partial-unique per company, NULL = catalog-only) to be stamped on documents.
  `slotNo` is company-GLOBAL: slot 3 means the same dimension in every consuming module, which is what makes cross-module reporting joinable by slot.
  `isRequired` = manual document entry must carry a value (system producers exempt); `isActive`; enable/disable only, no deletes.
- `dimension.DimensionOption` - the values (code + description), real intra-service FK to its category, unique code per category.
  Consuming documents reference options **by id** through their own `analysis<slotNo>Id` columns, so renames are free and history never strands.
- Consumers own their stamping columns and indexes (e.g. `ar.Ledger.analysis1Id..analysis6Id` with partial indexes `(analysisNId, trxDate) WHERE NOT NULL` - only tagged rows are indexed, so the sparse NULL majority costs nothing and reports stay a one-column `GROUP BY`).

## The gateway (`platform/dimensionGateway.js`)

- `entryMeta(companyId)` - slot-assigned active categories + active options, for entry-dialog pickers.
- `readSelections(companyId, body)` - validates a manual entry's `body.analysis` (`{ "<slotNo>": optionId }`): slot assigned + active, option of that category + active, `isRequired` enforced; returns the six `analysis<N>Id` column values.
- `copyColumns(row)` - the six columns of an existing row, for copies (e.g. AR void reversals).
- `registerUsageCheck(fn)` / `slotInUse(...)` - **the slot-repurpose lock's eyes**: the dimension service cannot query consumers' tables, so each consumer registers a checker at composition time (`src/wiring/dimensionUsage.js`; AR checks its `analysis<N>Id` columns).
  Once any consumer's document references a category's options, its `slotNo` can no longer change (rename stays free) - disable and create a new dimension instead.
  WHEN SPLIT: the checks become internal HTTP endpoints the dimension service calls.

## Consumers

- **Account Receivable** (2026-08-25): manual Invoice/DN/CN entry renders one picker per slot-assigned dimension (account meta ships `analysis`), drafts re-stamp on edit, void reversals copy the columns, `postLedgerDoc` accepts `analysisColumns` for future producer pass-through.
  See account-receivable.md.
- AP / GL / PO: future - each adds its own `analysis<N>Id` columns + partial indexes and registers a usage check.
