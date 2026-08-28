# Golf Management

> Status: IN PROGRESS (Master File Setup being built at `src/modules/golf`).
> Tier: **Product (core system)**.
> Source spec: the 2006 Mission Hills master-file SRS (MH-MasterFile-SRS-V2.1); options are being carried over one by one.

## Purpose
Golf operations: courses, tee-time scheduling and booking, flights/pairings,
handicaps, competitions, pro-shop/scoring as needed.

## Domain model - how a golf course is set up
Golf courses are built from NINE-hole **unit courses** first.
A unit course has a type: `out` (front nine only), `in` (back nine only) or `composite` (either).
A full 18-hole **course** is then formed by picking two unit courses - the 1st as the OUT (front) nine and the 2nd as the IN (back) nine - plus optional standby and floodlit fallback nines.
Hole numbering follows the type (OUT -> 1-9, IN -> 10-18).

## Owns (data)
- `golf.UnitCourse` - 9-hole unit course master file (code, type, completion minutes, floodlight + lighting-fee lead time). **Built.**
- `golf.UnitCourseHole` - hole rows of a unit course (par 3/4/5, handicap index, remarks); numbering fixed by the type (OUT 1-9, IN 10-18, COMPOSITE 1-18). HCP parity follows the numbering context: holes 1-9 take ODD indexes, holes 10-18 EVEN, so an OUT+IN pairing yields a full 1-18 set. Intra-service FK, cascades with the unit course. **Built.**
- `golf.UnitCourseTeeBox` + `golf.UnitCourseTeeBoxDistance` - tee boxes of a unit course (colour code, number, description, measurement unit meter/yard) with PER-HOLE distances (the scorecard's yardage rows; OUT/IN totals are computed, never stored). Cascade with the unit course. Difficulty ratings (course/slope) deliberately live at the 18-hole Course level (2.2.4), not here. **Built.**
- `golf.Course` - the 18-hole course (spec 2.2.4): code/display sequence/description, first nine (OUT|COMPOSITE), second nine (IN|COMPOSITE, must differ from first), optional alternate nine and night nine (must be a floodlit unit course), cross over time, course photo (GCS URL). Column names match the screen labels (user's vocabulary); the legacy zone column is dropped. **Built.**
- `golf.CourseTeeTimeSet` + `golf.CourseTeeTimeSlot` - per-COURSE tee-off/flight time setups (spec 2.2.5/2.2.6 collapsed: flight time is a property of the course - walking courses take longer intervals, unlit courses a shorter day). Versioned by day scope (all/weekday/weekend - public holidays count as weekend by business rule; classification from Company Weekend Days + Public Holidays, no Date Type master) + effective date (seasonal daylight). Slots generated from the header, individually adjustable, front-desk-only flag per slot. **Built.**
- `golf.TransactionType` - the golf billing-item catalog, mirroring membership's Transaction Type: code (unique per company) + charge type (fixed vocabulary: `green-fee` / `caddy-fee` / `buggy-fee` / `no-show` / `miscellaneous` / `package`) + description + THE tax scheme by code via the tax seam (single source - consuming rows such as green-fee matrices and no-show penalties inherit it, never store their own) + `allowPriceOverride` (default OFF - whether the cashier may amend the pre-set price manually when billing; OFF means the resolved rate is binding) + `iconUrl` (public GCS URL of the billing-item icon shown on the catalog and the front-desk billing tiles; uploaded via `POST /transaction-types/icon`, per-env `ASSETS_BUCKET`).
  Sequelize model name is `GolfTransactionType` (membership already registered `TransactionType` in the global model registry); the table is still `golf."TransactionType"`. **Built.**
- `golf.TransactionTypeRate` - the pricing of a transaction type: effective-dated price cards (unique per (type, effectiveDate); resolution = the ACTIVE card with the latest effective date on-or-before the play date, same rule as tee-time sets).
  Matrix charge types (`green-fee`/`caddy-fee`/`buggy-fee`) carry the eight member/visitor × 9/18-holes × weekday/weekend cells; flat charge types (`no-show`/`miscellaneous`/`package`) carry a single `flatAmount` (user decisions 2026-08-06 / 2026-08-27).
  "Weekend" INCLUDES public holidays (platform business rule via `platform/calendarGateway.js` - no third holiday tier); amounts are tax-exclusive (tax comes from the parent's scheme at billing).
  Future-dated cards may be hard-deleted; a card already in force is history (disable instead). Intra-service FK, cascades with the transaction type. **Built.**
  BILLING RULES for the future registration/flight screen (recorded 2026-08-06, binding when built): the green fee is charged AUTOMATICALLY at registration for every player EXCEPT a member whose Membership Type has `isGolfAllow` - so a valid member without golfing rights IS charged the green fee, at the MEMBER price; guests/visitors pay the visitor price. Caddy/buggy fees price by the same member/visitor split. Manual amendment of a resolved price at billing is allowed only when the transaction type's `allowPriceOverride` is on.
- `golf.TransactionTypeElement` - the element lines of a PACKAGE transaction type (chargeType `package`, user decisions 2026-08-27), e.g. Weekday Twin Package 200.00 = 1 × share buggy (100.00) + 2 × caddy (50.00 each).
  Each line: `transactionTypeId` (the owning PACKAGE - parent column named to match `TransactionTypeRate`, user decision 2026-08-27; table renamed from the short-lived `TransactionTypePackageItem` via a guarded boot migration in app.js) + `elementTransactionTypeId` (a peer transaction type of the SAME company - never a package itself, no nesting; an element in use cannot become a package) + `quantity` (1-99) + `unitAmount` (the per-unit allocation of the package price - the revenue breakdown at billing) + `sortOrder`; unique (package, element).
  The package's own SELLING price stays in its flat `TransactionTypeRate` cards; the element sum is shown against it in the editor but deliberately NOT enforced.
  The package header additionally carries `autoTransactionTypeId` (required for packages; same-company, active, non-package - e.g. PAK1 -> GF1): the transaction type that receives the AUTOMATIC balance line at billing.
  Lines are replaced atomically inside the create/update transaction (`packageItems` in the POST/PUT payload); saving a package as a plain charge type clears its lines. Intra-service FK, cascades with the package. **Built.**
  PACKAGE BILLING RULES (user spec 2026-08-28, binding for the future Bill Item stage; supersedes the earlier per-element-tax decision):
  1. Selecting a package inserts DETAIL lines, not one line (analysis requirement): one line per element (quantity × the unit price stored on the element line, billed as-is) PLUS one automatic line to `autoTransactionTypeId` for the balance = package price − Σ(element lines). Example: PAK1 450.00 = BG1 1×101.00 + CD1 2×34.00 + GF1 auto 281.00.
  2. TAX: the PACKAGE's own tax scheme applies to EVERY generated line (the elements' schemes are ignored for package billing); the package Tax Scheme field is back on the setup form.
  3. ROUNDING: line taxes are computed per line, then the LAST generated line's tax is adjusted so Σ(line tax) equals the tax computed directly on the package amount (e.g. 5.72 + 3.85 + 15.91 = 25.48 -> adjust to force the direct 450.00 → 25.47).
- `golf.CourseClosurePlan` + `golf.CourseClosureDay` - Course Closure Plan (spec 2.2.8): the rule header (description/reason, dayScope all|weekday|weekend, nineScope first-nine|second-nine|all, date period capped at one year, daily closure window - both times NULL = whole day) and its GENERATED per-day rows (unique (plan, date); per-day times/nine scope adjustable, isActive false = except a single day). Generation classifies each date server-side through `platform/calendarGateway.js` (Company Weekend Days + Public Holidays; HOLIDAYS COUNT AS WEEKEND) and returns a preview; the PUT saves the reviewed list atomically. Tee-sheet generation (2.2.10/11) will skip/block slots overlapping an active closure day for the affected nines. **Built.**
- Planned next (per spec): tee-sheet generation (2.2.10/2.2.11), handicap control, min players, penalties, player types.
- All tables live in the `golf` Postgres schema; references `companyId` and `memberId` by **UUID only**.

## Public API (gateway seam: `/api/golf`)
- `GET /health` - liveness (unauthenticated).
- `GET /unit-courses/meta` - course-type vocabulary (OUT/IN/COMPOSITE, incl. each type's hole range).
- `GET /unit-courses` · `POST /unit-courses` · `PATCH /unit-courses/:id` - Unit Course master file (enable/disable via `isActive`, no hard delete).
- `GET /unit-courses/:id/holes` · `PUT /unit-courses/:id/holes` - Hole Setup; PUT replaces the set atomically and enforces the type's exact numbering.
- `GET /unit-courses/:id/tee-boxes` · `PUT /unit-courses/:id/tee-boxes` - Tee Box Setup; PUT replaces headers + per-hole distances atomically (colour unique per course, unit meter/yard, distance 1-2000 per hole).
- `GET /courses` · `POST /courses` · `PATCH /courses/:id` · `POST /courses/photo` - Course Setup; nine references validated against the company's unit courses (type + floodlight rules), photo upload returns a GCS URL.
- `GET /courses/meta` - day-scope vocabulary for tee-time sets.
- `GET /courses/:id/tee-time-sets` · `POST /courses/:id/tee-time-sets` · `PATCH /courses/:id/tee-time-sets/:setId` · `PUT /courses/:id/tee-time-sets/:setId/slots` - per-course tee-time sets; unique (course, dayScope, effectiveDate); PUT replaces the slot list atomically.
- `GET /transaction-types/meta` · `GET /transaction-types/tax-schemes` · `GET /transaction-types` · `POST /transaction-types` · `PUT /transaction-types/:id` · `PATCH /transaction-types/:id` - Transaction Type master file (behind `requireMenuAction('/golf/transaction-types')`); tax scheme must be a company-usable OUTPUT scheme; enable/disable via `isActive`, no hard delete. `meta` also serves `matrixChargeTypes` (which charge types price by the 8-cell matrix). `POST /transaction-types/icon` (multipart field `icon`, 2 MB) uploads the billing-item icon to the per-env `ASSETS_BUCKET` and returns the public URL the caller stores via create/update. For chargeType `package`, POST/PUT take `packageItems` (element lines, replaced atomically in the same transaction) and the listing returns them per row.
- `GET /transaction-types/:id/rates` · `POST /transaction-types/:id/rates` · `PUT /transaction-types/:id/rates/:rateId` · `PATCH /transaction-types/:id/rates/:rateId` (isActive) · `DELETE /transaction-types/:id/rates/:rateId` (future-dated only) - Pricing; payload shape (matrix cells vs flat amount) validated against the parent's charge type; unique effective date per type (409 on clash).
- `GET /courses/:id/closure-plans` · `POST /courses/:id/closure-plans` · `PATCH /courses/:id/closure-plans/:planId` · `POST /courses/:id/closure-plans/:planId/generate-days` (preview - computes, never saves) · `PUT /courses/:id/closure-plans/:planId/days` (atomic replace) - Course Closure Plans; `/courses/meta` also serves the nine-scope vocabulary.
- (Seed already reserves a "Tee Time Setup" menu at `/golf/tee-times`; the Unit Course screen is `/golf/unit-courses`.)

## Depends on
- Identity (JWT verify) · Control Plane (`requireModule('Golf Management')`, roles).
- **Membership** - validate a member / standing before booking, via
  `internalServiceUrl('membership')` (HTTP), never shared tables.
- Notification (outbox): `TeeTimeBooked`, `BookingCancelled`.

## Consumed by
- Reporting/analytics; possibly Facility (shared resource calendars) - via API/events.

## Auth & entitlements
- Valid JWT + active company subscribed to the **Golf Management** module.

## Migration status
- [x] Models (UnitCourse, UnitCourseHole, UnitCourseTeeBox+Distance) · [x] Routes/controllers (unit-courses, holes, tee-boxes) · [ ] Events · [ ] Own DB (own `golf` schema, shared instance) · [ ] Own deploy
