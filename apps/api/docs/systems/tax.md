# Tax

> Status: BUILT (backend + web live; the transaction-time *snapshot* consumer is pending).
> Tier: **Shared capability** (consumed by every product system).
> Own Postgres schema: **`tax`**. Gateway seam: **`/api/tax`**.

## Purpose

Define the tax schemes a club charges/pays, and resolve the correct rate for a transaction.
A scheme is a named tax (e.g. Malaysia SST output, Singapore GST input) with an inclusive/exclusive price treatment, a class (input/output/contra), and one or more effective-dated rate components.
Membership, Facility and Golf all price transactions with the same schemes, so tax is defined once and shared, not re-implemented per product.

## Why a shared service, not a table inside a product

Tax is consumed by Membership, Facility and Golf.
If it lived inside any one of them, the other two would either duplicate it or reach across a service boundary to read it - both violate the golden rules.
So tax is its own capability with its own schema and its own gateway seam, owned by neither product.
Consuming products depend on it one-directionally, through a seam, and never touch its tables.

## The three-tier ownership model (the core design decision)

The hardest question was *where tax is owned*: at the platform, or at the subscriber.
The answer is **layered**, because "tax scheme" bundles two different things:

- **Tax reference** - the fact that Malaysia has SST output at a rate, effective from a date. Objective, country-scoped, identical for every subscriber there.
- **Tax configuration** - which schemes a given company actually uses, its GL mapping, its registration status. The subscriber's legal responsibility, and it varies between subscribers in the same country.

Splitting those gives three tiers, mirroring the [notification](notification.md) email-template pattern (platform default -> tenant override -> consumer use):

1. **Platform seed** (`TaxSchemeTemplate` / `TaxRateTemplate`).
   A curated, dated, best-effort STARTER catalog shipped in the code (see `tax-templates.catalog.js`), seeded at boot.
   It is an onboarding accelerator, NOT an authoritative, continuously-maintained tax source.
2. **Subscriber-owned catalog** (`TaxScheme` / `TaxRate`).
   The authoritative copy.
   A subscriber loads platform defaults or defines its own, then owns and maintains them - because the subscriber is legally responsible for its own tax.
3. **Company adoption** (`CompanyTaxScheme` / `CompanyTaxAccount`).
   A company consumes the schemes for its own country, optionally disabling some and overriding GL accounts.

### Why not pure platform (tier 1 only)

Tax liability is the subscriber's, not ours.
If the platform were the single source of truth and got a rate or claimable flag wrong, that is our liability, and subscribers could not correct it.
Two subscribers in the same country also legitimately differ (one tax-registered, one not; different claimable positions), so configuration must be tenant-owned.

### Why not pure subscriber (tier 2 only)

Every subscriber re-keying "Malaysia SST effective 2024-03-01" is wasteful and error-prone.
That is exactly the shared factual data the platform already curates (like Country/Currency), so the platform ships a starter and the subscriber adopts it.

### The seam between platform and subscriber: copy-on-adopt

"Load defaults for country" COPIES active templates into the subscriber's own tables and stamps `TaxScheme.sourceTemplateId` for provenance.
From that moment the two diverge - there is no runtime link.
The platform never chases ongoing rate changes; the subscriber maintains its copy.
Re-running Load defaults is idempotent: a scheme code the subscriber already has is skipped, never overwritten.

## Data model

All tables live in the `tax` Postgres schema.

| Table | Tier | Key columns | Notes |
| --- | --- | --- | --- |
| `TaxSchemeTemplate` | Platform seed | `countryCode`, `taxSchemeCode`, `name`, `ieFlag`, `taxClass`, `seededAsOf`, `isActive` | Unique `(countryCode, taxSchemeCode)`. |
| `TaxRateTemplate` | Platform seed | `taxSchemeTemplateId` (FK), `taxCode`, `taxRate`, `taxPriority`, `isClaimable`, `claimPercentage`, `glAccountCode` | Detail lines; NO effective date (the template is a point-in-time snapshot). |
| `TaxScheme` | Subscriber | `accountId`, `countryCode`, `taxSchemeCode`, `name`, `ieFlag`, `taxClass`, `sourceTemplateId`, `isActive` | Unique `(accountId, countryCode, taxSchemeCode)`. `accountId`/`sourceTemplateId` are plain UUID references (no FK). |
| `TaxRate` | Subscriber | `taxSchemeId` (FK), `taxCode`, `taxRate`, `taxPriority`, `isClaimable`, `claimPercentage`, `glAccountCode`, `effectiveFrom`, `isActive` | Unique `(taxSchemeId, taxCode, effectiveFrom)`. Effective-dated history. |
| `CompanyTaxScheme` | Company | `companyId`, `taxSchemeId` (FK), `isEnabled` | Unique `(companyId, taxSchemeId)`. `companyId` is a plain UUID (no FK). Opt-out: a row only exists to override. |
| `CompanyTaxAccount` | Company | `companyTaxSchemeId` (FK), `taxCode`, `glAccountCode` | Unique `(companyTaxSchemeId, taxCode)`. Per-component GL override. |

Enums (`tax.constants.js`, stored as strings and served via `/api/tax/meta`, not Postgres ENUM types):
- `ieFlag`: `INCLUSIVE` | `EXCLUSIVE` - is the rate baked into the price or added on top.
- `taxClass`: `INPUT` (purchases, potentially claimable) | `OUTPUT` (sales collected) | `CONTRA` (offsetting entry).
- `taxClass` is stored on the column named `taxClass`, not `class`, because `class` is a reserved word.

## Design rules and the reasoning behind each

### Rates are effective-dated rows, never mutated in place

A rate change (e.g. SST 6% -> 8%) is a NEW `TaxRate` row with a later `effectiveFrom`, not an UPDATE of the old one.
Old rows are immutable.
The active rate on any date is the row with the greatest `effectiveFrom <= date`.
Why: a posted invoice must keep the rate it was charged; mutating a rate would silently rewrite history.

### A scheme can have several components effective at once (stacking)

`taxPriority` (1-5) orders multiple concurrent components (distinct `taxCode`s) within one scheme, for compound/stacked taxes.
So "two rates effective at once for one scheme" is modelled as two `taxCode`s, both current, ordered by priority - separate from the history dimension above.

### Consumers snapshot the resolved tax; they never live-join

When a product posts a charge it copies the resolved values (code + rate + claimability + GL) onto its OWN transaction row.
It does not keep a foreign key into `TaxRate` and re-read it later.
Why: this is the same immutability guarantee at the consumer boundary - last year's document keeps last year's rate even after the catalog moves on, and the product service stays decoupled from tax internals.

### Country-partitioned; a company consumes by its OWN country

The subscriber catalog is keyed `(accountId, countryCode)` because one subscriber can operate companies in more than one country (SEA rollout).
A company resolves schemes by ITS OWN `Company.countryCode`, never the subscriber's "home" country.
`Company.countryCode` is the canonical ISO 3166-1 alpha-2 (lowercase) added for this; the older free-text `Company.country` is display-only.

### Company adoption is opt-out

Absence of a `CompanyTaxScheme` row means the company uses the scheme with subscriber defaults.
A row exists only to DISABLE a scheme for one company, or to carry GL overrides.
Why: the common case (a company uses all its country's schemes) needs no configuration; rows are the exception, not the rule.

### GL override grain = per component (taxCode), per company

The GL account lives on the rate line (`TaxRate.glAccountCode`), because each component posts to its own account.
A company override therefore matches that grain (`CompanyTaxAccount` keyed by `taxCode`), not a single per-scheme account, which would be lossy.
It is keyed by `taxCode` (not the effective-dated `TaxRate` row) because a GL account is stable across a component's rate history.

## Resolution algorithm

Subscriber-level (`taxResolver.resolveScheme`):
1. Find the active `TaxScheme` for `(accountId, countryCode, taxSchemeCode)`.
2. Load its `TaxRate` rows with `effectiveFrom <= onDate` (default today), active only.
3. Keep the latest-effective row per `taxCode`.
4. Return the components ordered by `taxPriority` - snapshot-ready (code, rate, claimability, GL, effectiveFrom).

Company-level (`taxResolver.resolveSchemeForCompany` / `listSchemesForCompany`):
1. Resolve as above.
2. Drop schemes the company disabled (`CompanyTaxScheme.isEnabled = false`).
3. Overlay the company's GL account per `taxCode` from `CompanyTaxAccount` (falls back to the subscriber default).

## The seam: how products consume tax

Products must not `require()` the tax module (golden rule 4).
They call through **`platform/taxGateway.js`**, which:
- resolves the active company's `{ companyId, accountId, countryCode }` (via `serviceContext.getUserContext` + `Company`),
- calls the company-aware resolver in-process today,
- is the single place that becomes an HTTP call to `internalServiceUrl('tax')` when tax is split out.

`serviceContext.getActiveAccountId(req)` is the related seam that resolves the subscriber account for subscriber-level tax screens, so those controllers never query `Company` directly either.

## First consumer: Membership Management

Membership is the first product to read tax, via the gateway (not the tax module):
- `GET /api/membership/tax/schemes[?date=]` - the schemes available to the active company (filtered + GL-overlaid), for a billing tax picker.
- `GET /api/membership/tax/schemes/:code[?date=]` - resolve one scheme at post time, before snapshotting.

These sit behind the existing `verifyToken` + `requireModule('Membership Management')` seam.
Membership does not yet have a charge/invoice entity, so the SNAPSHOT half (copying the resolved component onto a transaction row) is documented but not built - that is the remaining work that will finally exercise GL overrides and effective dating end to end.

## Public API (gateway seam `/api/tax`, all behind `verifyToken`)

Subscriber catalog (account resolved from the active workspace):
- `GET /meta` - the `ieFlags` / `taxClasses` option lists (also the server's validation source).
- `GET /schemes[?countryCode=]` - the subscriber's schemes with rate lines.
- `POST /schemes` - create a scheme (optionally with rate lines, atomic).
- `PATCH /schemes/:id` - edit header fields / toggle `isActive`.
- `POST /schemes/:id/rates` - add a rate line (a rate change is a new line, not an edit).
- `PATCH /rates/:id` - correct a rate line.
- `DELETE /rates/:id` - remove a rate line.
- `POST /load-defaults` `{ countryCode }` - copy the platform's active templates for a country into the subscriber's catalog (copy-on-adopt; idempotent).

Per-company adoption (active workspace company):
- `GET /company/schemes` - the country's schemes with this company's adoption state + default-vs-company GL per component.
- `PUT /company/schemes/:taxSchemeId` `{ isEnabled, glOverrides: { taxCode: gl } }` - enable/disable + replace GL overrides atomically.

## Platform catalog and boot seeder

The platform templates come from a BUNDLED starter catalog (`tax-templates.catalog.js`), not a hand-CRUD admin screen.
This matches the currency "Load defaults" and email platform-default patterns: curated, versioned in code, redeployable.
`taxTemplate.service.seedPlatformTaxTemplates()` runs at boot in `app.js` (next to the email defaults) and is idempotent: it refreshes each template's fields and rate lines from the bundle, but PRESERVES an admin's `isActive` toggle.
To add a country or correct a starter rate: edit the catalog file and redeploy.
Current bundle: Malaysia (SST), Singapore (GST), Thailand (VAT), Indonesia (PPN).

## DB isolation - own Postgres schema

Every tax table lives in the dedicated **`tax`** schema (e.g. `tax."TaxScheme"`), added to `PRODUCT_SCHEMAS` in `platform/schemas.js` so it is created before `sequelize.sync()`.
This is the physical microservice seam: the service extracts later with a clean `pg_dump --schema=tax` into its own database, no renames, no app changes.

## Golden-rule compliance

1. **One owner per table** - the tax service owns all `tax.*` tables; no other module writes them.
2. **Reference other services by UUID** - `accountId`, `companyId`, `sourceTemplateId`, `glAccountCode` are plain values, no cross-service FK. Intra-tax header/detail FKs are fine (same service).
3. **Identity from JWT, entitlement from Control Plane** - via `serviceContext`; tax controllers resolve account/company through the seam, never by querying `Company` directly.
4. **Cross-service calls go through the seam** - products reach tax only via `platform/taxGateway.js`, ready to become an `internalServiceUrl('tax')` HTTP call.
5. **Each `app.use('/api/tax', ...)` is the gateway seam** - re-pointable without touching callers.

## Web

Subscriber (System Setup tier, `systemModule: 'System Setup'`):
- `/admin/tax-schemes` (+ `/:id`) - Tax Setup, master-detail catalog editor with "Load defaults".
- `/admin/company-tax` - Company Tax, per-active-company enable/disable + GL overrides.

Companies screen gained a canonical country: the picker mirrors its alpha-2 into `Company.countryCode`, and a boot backfill fills it from the free-text `country` for legacy rows.

**Activation (DB, done by admin - menus live in the DB, not hardcoded):**
Add `Menu` rows under the **System Setup** module: `Tax Setup` -> `/admin/tax-schemes`, `Company Tax` -> `/admin/company-tax`, grant the role access (`RoleMenu`), then log out/in so cached menus refresh.

## Not built yet

- The **charge/invoice entity in a product** that resolves at post time and snapshots the result - the only consumer that will exercise GL overrides and snapshots for real.
- A read-only **platform-admin template screen** (view + enable/disable) - optional; the bundle is the source of truth, so it is not required for the feature to work.

## Migration status
- [x] Models · [x] Routes/controllers · [x] Resolver + gateway seam · [x] Own schema · [x] Web screens · [ ] Consumer snapshot · [ ] Own deploy
