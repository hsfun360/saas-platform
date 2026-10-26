# Facility Management

> Status: **SLICE 1 BUILT 2026-10-25** (structures approved 2026-10-25; models, routes and the four screens are in the tree, awaiting the dev smoke). Gateway seam `/api/facility` is live for slice 1.
> Tier: **Product (core system)**.
> Slice 1 (Specification, Facility Type, Facility) is specified in full below; slices 2-5 are outlined and get their own structures when their turn comes.

## Purpose

Manage the club's bookable and walk-in facilities: courts booked by time slot, the gym and pool entered on registration, lockers and towels issued at a control station, instructor-led classes, with the booking controls (windows, per-type slot limits, guest policy, cancellation notice, no-show penalties) a members' club needs.

## Decisions taken (2026-10-24, kick-off)

- **Vocabulary.** The person identity is `facility.Patron` (thin row, member or visitor) + `facility.OtherPatron` (the visitor profile), mirroring `golf.Golfer` / `golf.OtherGolfer`.
  Screens are *Facility Specification*, *Facility Types*, *Facilities*, *Facility Bookings*, *Control Station*, *Classes*.
- **Three usage modes on the Facility Type, no more:** `slot` (courts: booked by fixed time slot from a slot set defined on the type), `entry` (gym, pool: register on arrival, optional capacity), `issue` (lockers: numbered units issued and returned; towels: a counted consumable).
  Hourly hall hire is a `slot` type with 60-minute slots and a high consecutive cap; there is no duration mode and no per-game mode.
- **Billing copies golf's shape into the facility schema** (`Bill` / `BillItem` / `BillPayment` / `TransactionType` / `PaymentType`, slice 2).
  Two tender catalogs are accepted; the shared billing service is extracted when POS becomes the third consumer.
  The rate-card axis is player type x day type x session band (peak / off-peak); per-slot price only in slice 2, day and half-day packages later as package transaction types.
- **Visitor profiles stay per module for now.** A non-member exists once in golf and once in facility; a platform visitor master may come later with a re-point.
- **Guest allowance.** `MembershipType.guestQuota` STAYS the golf per-booking cap (live since 2026-09-28).
  Membership Type gains a NEW monthly club-wide guest allowance, and Membership OWNS the guest-usage ledger (`membership.GuestVisit`) that every producer writes through the membership seam; facility is the first producer, golf is wired later.
  Facility Type caps per booking / per visit are facility's own and tighten within the allowance.
- **No-show** = a charge (transaction type, posted to AR, pending / posted / waived like golf) AND a strike rule (N no-shows in M days suspends booking for S days), each switchable per Facility Type under one master switch.
- **Build order:** (1) masters - Specification, Facility Type, Facility; (2) slot Booking with guest control and billing; (3) Control Station; (4) No show; (5) Classes.
- Golf patterns reused as-is: the per-company Specification singleton with master switches, sparse exception rules where the most specific rule wins, weekday / weekend classification through `platform/calendarGateway.js` with public holidays counting as weekend, the booking channel REFUSES while the front desk WARNS, header -> generated rows the user reviews and saves (slot sets, closure days), the three ownership stamps on every table.

## Domain model - how a club's facilities are set up

A **Facility Type** is a kind of facility with one usage mode and one set of rules: Badminton (slot, 60-minute slots, 2 slots per member per day, guests allowed), Tennis (slot), Gym (entry, no guests, capacity 40), Swimming Pool (entry, guests allowed), Locker (issue, numbered units), Towel (issue, counted).
A **Facility** is one physical unit of a type: Badminton Court 1-8, Tennis Court 1-10, the Gym, Locker 001-200.
Towels have one Facility row ("Towel counter") because the type does not track units.
A slot-mode type owns its **slot sets** (operating window + slot length per day scope and effective date, generated into numbered slots, individually adjustable) so ten courts share one definition; entry and issue types carry plain opening hours instead.
**Closures** are keyed on the type with an optional single facility (NULL = every unit of the type), expanded into closure days the user reviews.
**Sessions** are the club's named day parts (Morning / Afternoon / Evening, time bands) kept on the Specification; they are the peak / off-peak axis of the rate card and the unit of the per-session booking limit.
The **Specification** singleton holds the club-wide defaults and master switches; a Facility Type overrides the limits that differ (advance days, slots per day, guest policy, no-show flags).

## Owns (data)

All tables live in the `facility` Postgres schema (`FACILITY_SCHEMA` joins `PRODUCT_SCHEMAS` in `platform/schemas.js` with the first model); `companyId`, `memberId`, `transactionTypeId`-style peer references are plain UUIDs (no cross-service FK); intra-service parent-child links are real FKs that cascade.
Every table carries `id` (UUID v4 PK), `createdAt` / `updatedAt`, and the three ownership stamps `createdBy`, `createdByDepartmentId`, `updatedBy` (UUID, nullable) unless stated otherwise; they are omitted from the column tables below.
Money columns are `DECIMAL(21,2)`; times are `TIME` (club-local); dates are `DATEONLY`.

### Slice 1 - masters (FULL DETAIL, for approval)

#### `facility.FacilitySetting` - Facility Specification (singleton per company)

Model `FacilitySetting`, table `facility."FacilitySetting"`, unique `(companyId)`.
Read-or-create lazily on first GET, like `GolfSetting`.
Only the switches and defaults that slice 1 screens show are declared now; later slices add their own columns (listed under each slice) so nothing dangles.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | One row per company (Control-Plane value ref). |
| `advanceBookingDays` | INTEGER | no | 7 | General booking window in days; a Facility Type may override (`FacilityType.advanceBookingDays`). |
| `advanceBookingHours` | INTEGER | no | 0 | Early-opening hours before midnight (0-23), club-wide; the window for date D opens at 00:00 of (D - days) minus these hours, club-local (golf's rule). |
| `allowSameDayBooking` | BOOLEAN | no | false | OFF = the window starts tomorrow; today's slots are taken only by Control Station registration. |
| `bookingLockMinutes` | INTEGER | no | 5 | How long a clicked slot stays claimed while the booking is keyed (1-60). |
| `guestControlEnabled` | BOOLEAN | no | false | Master switch. OFF = no guest restriction anywhere (type flags and rules are stored but ignored). |
| `allowGuestWeekday` | BOOLEAN | no | true | General allow for visitor guests, weekday. |
| `allowMemberGuestWeekday` | BOOLEAN | no | true | General allow for a member using another member's booking, weekday. |
| `allowGuestWeekend` | BOOLEAN | no | true | Weekend + public holiday. |
| `allowMemberGuestWeekend` | BOOLEAN | no | true | Weekend + public holiday. |
| `noShowControlEnabled` | BOOLEAN | no | false | Master switch for cancellation notice, no-show charges and strikes (slice 4 adds the detail columns). |
| `cancellationNoticeHours` | INTEGER | no | 24 | Hours of notice a cancellation needs (0 = no notice rule). Shown in slice 1, enforced from slice 2. |

Columns added by later slices (declared with that slice, listed here for the whole picture): slice 2 `allowMembershipTypeOverride`, `bookingLimitScope`; slice 4 `lateCancellationAction`, `noShowTransactionTypeId`, `noShowChargeBasis`, `noShowGraceMinutes`, `strikeCount`, `strikeWindowDays`, `strikeSuspensionDays`; slice 5 `classesEnabled`, `classCancellationNoticeHours`, `classWaitlistOfferHours`.

#### `facility.FacilitySession` - the club's named day parts

Model `FacilitySession`, table `facility."FacilitySession"`, unique `(companyId, name)`.
Same shape and rules as `golf.GolfSession`: PUT-replaced from the Specification, bands must not overlap, end exclusive.
A slot whose start no band covers is outside the session system (no session price band, no per-session limit).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `name` | STRING(50) | no | | 'Morning', 'Afternoon', 'Evening', 'Peak'. |
| `startTime` | TIME | no | | |
| `endTime` | TIME | no | | End exclusive: 17:00-22:00 owns slots starting 17:00..21:59. |
| `sequence` | INTEGER | no | 1 | Display order. |

#### `facility.FacilityType` - the kind of facility and its rules

Model `FacilityType`, table `facility."FacilityType"`, unique `(companyId, code)`.
The `code` (UPPER_SNAKE, frozen once in use) is the key the booking limits, rate cards and reports key on; `description` is display only.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `code` | STRING(20) | no | | 'BADMINTON', 'TENNIS', 'GYM', 'POOL', 'LOCKER', 'TOWEL'. |
| `description` | STRING | no | | Display name. |
| `usageMode` | STRING(10) | no | | `slot` / `entry` / `issue` (facilityType.constants USAGE_MODES). Frozen once a facility exists under the type. |
| `iconUrl` | STRING | yes | | Public GCS URL of the type's tile icon (same upload flow as golf transaction-type icons). |
| `sortOrder` | INTEGER | no | 100 | Order on the booking grid and the station. |
| `isActive` | BOOLEAN | no | true | Inactive = hidden from booking and the station; existing bookings stand. |
| **slot mode** | | | | |
| `maxParticipants` | INTEGER | yes | | Participants one slot (one court) holds, e.g. badminton 4, tennis 4; NULL = not tracked (a hall). |
| `minParticipants` | INTEGER | no | 1 | Minimum participants a booking must name (1 = no rule). |
| `maxSlotsPerDayWeekday` | INTEGER | no | 0 | Slots of THIS type one member may hold per day, weekday (0 = no limit). Counted as booker or participant; cancelled bookings free it. |
| `maxSlotsPerDayWeekend` | INTEGER | no | 0 | Same, weekend + public holiday. |
| `maxConsecutiveSlots` | INTEGER | no | 0 | Adjacent slots on one facility in one booking (0 = no limit; a hall sets a high number). |
| `advanceBookingDays` | INTEGER | yes | | Override of the Specification's general days for this type; NULL = general. |
| **entry mode** | | | | |
| `capacity` | INTEGER | yes | | Persons inside at one time across the type's facilities; NULL = unlimited. The station shows the live count and refuses past it. |
| **issue mode** | | | | |
| `trackUnits` | BOOLEAN | no | true | ON = each Facility row is one numbered unit issued and returned (locker); OFF = a counted consumable issued by quantity (towel). |
| `maxIssuePerPatron` | INTEGER | no | 1 | Units or pieces one patron may hold at a time (0 = no limit). |
| **opening hours (entry + issue modes; slot types get them from the slot set)** | | | | |
| `openTimeWeekday` | TIME | yes | | Both NULL = no restriction. |
| `closeTimeWeekday` | TIME | yes | | |
| `openTimeWeekend` | TIME | yes | | Weekend + public holiday. |
| `closeTimeWeekend` | TIME | yes | | |
| **guest policy (all modes; takes effect only while `guestControlEnabled`)** | | | | |
| `guestsAllowed` | BOOLEAN | no | true | OFF = no visitor guest under this type at all (Gym). |
| `memberGuestsAllowed` | BOOLEAN | no | true | OFF = a member may not join another member's booking / visit under this type. |
| `maxGuestsPerBooking` | INTEGER | yes | | Visitor guests one booking (slot) or one visit (entry) may carry; NULL = no limit, 0 = none. Counts against the member's monthly allowance (slice 2). |
| `hostMustBePresent` | BOOLEAN | no | true | The host member must be a participant / be registered for the guests to be admitted. |

Columns added by later slices: slice 2 `feeTransactionTypeId` (the default charge per slot / per entry), `guestFeeTransactionTypeId`, `requiresApproval`; slice 4 `noShowChargeEnabled`, `noShowStrikeEnabled`.

#### `facility.FacilityTypeSlotSet` + `facility.FacilityTypeSlot` - the slot definition of a slot-mode type

Models `FacilityTypeSlotSet` / `FacilityTypeSlot`, tables `facility."FacilityTypeSlotSet"` (unique `(facilityTypeId, dayScope, effectiveDate)`) and `facility."FacilityTypeSlot"` (unique `(slotSetId, slotNumber)`).
Mirror of `golf.CourseTeeTimeSet` / `CourseTeeTimeSlot`: versioned by day scope and effective date; resolution for a type + date picks the active set whose day scope matches and whose effective date is the latest on or before the date (an exact `weekday` / `weekend` set outranks `all`).
Slots are generated from the header (first start + slot minutes up to the last start), reviewed, then saved; a generated slot can be unticked (lunch break) or flagged front-desk-only.
Intra-service FKs, cascade with the type / the set.
Only a `slot`-mode type may own slot sets.

`FacilityTypeSlotSet`:

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `facilityTypeId` | UUID | no | | FK -> FacilityType. |
| `description` | STRING | yes | | 'Weekend schedule'. |
| `dayScope` | STRING(10) | no | 'all' | `all` / `weekday` / `weekend` (holidays = weekend). |
| `effectiveDate` | DATEONLY | no | | In force from this date within its scope. |
| `firstSlotTime` | TIME | no | | Start of the first slot. |
| `lastSlotTime` | TIME | no | | Start of the last slot. |
| `slotMinutes` | INTEGER | no | | Slot length (15-240). Every slot of the set has the same length. |
| `frontDeskFrom` | TIME | yes | | Slots starting at or after this time default to front-desk-only. |
| `isActive` | BOOLEAN | no | true | |

`FacilityTypeSlot` (no ownership stamps, like the golf slot rows):

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `slotSetId` | UUID | no | | FK -> FacilityTypeSlotSet. |
| `slotNumber` | INTEGER | no | | 1..n within the set. |
| `startTime` | TIME | no | | |
| `endTime` | TIME | no | | start + slotMinutes (stored so consumers never recompute). |
| `isFrontDesk` | BOOLEAN | no | false | No advance booking; the station may still register a walk-in here. |
| `isActive` | BOOLEAN | no | true | Unticked = the slot does not exist that day (break). |

#### `facility.Facility` - one physical unit

Model `Facility`, table `facility."Facility"`, unique `(companyId, code)`; index `(facilityTypeId, sortOrder)`.
Intra-service FK to the type (restrict delete while units exist).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | Denormalised for listing and uniqueness (the type carries it too). |
| `facilityTypeId` | UUID | no | | FK -> FacilityType. |
| `code` | STRING(20) | no | | 'BC1', 'TC10', 'L001'. |
| `name` | STRING | no | | 'Badminton Court 1', 'Locker 001'. |
| `location` | STRING | yes | | 'Sports Hall, Level 2'. |
| `isIndoor` | BOOLEAN | no | false | Booking grid filter. |
| `isFloodlit` | BOOLEAN | no | false | Booking grid filter. |
| `capacity` | INTEGER | yes | | Entry mode only: this unit's own cap (a second pool); NULL = counted under the type's capacity. |
| `pictureUrl` | STRING | yes | | GCS URL, same upload flow as the course photo. |
| `remarks` | TEXT | yes | | |
| `sortOrder` | INTEGER | no | 100 | Order on the grid. |
| `isActive` | BOOLEAN | no | true | Inactive = not bookable, not issuable; existing bookings stand. |

Columns added by later slices: slice 3 `unitStatus` (`available` / `issued` / `out-of-service`, issue mode) and `currentIssueId`.

#### `facility.FacilityClosurePlan` + `facility.FacilityClosureDay` - maintenance and event closures

Models `FacilityClosurePlan` / `FacilityClosureDay`, tables `facility."FacilityClosurePlan"` (index `(facilityTypeId, dateFrom, dateTo)`) and `facility."FacilityClosureDay"` (unique `(closurePlanId, closureDate)`).
Same header -> generated days shape as `golf.UnitCourseClosurePlan` / `UnitCourseClosureDay`.
A closed slot is unbookable and the station refuses registration / issue inside the window; existing bookings on a newly closed slot are listed for the operator to move or cancel (slice 2 wires the change-booking path).

`FacilityClosurePlan`:

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `facilityTypeId` | UUID | no | | FK -> FacilityType: the type that closes. |
| `facilityId` | UUID | yes | | FK -> Facility: ONE unit; NULL = every unit of the type (tournament, pool cleaning). |
| `description` | STRING | no | | 'Court resurfacing'. |
| `dayScope` | STRING(10) | no | 'all' | `all` / `weekday` / `weekend` inside the period. |
| `dateFrom` | DATEONLY | no | | |
| `dateTo` | DATEONLY | no | | |
| `startTime` | TIME | yes | | Daily window; both NULL = closed all day. |
| `endTime` | TIME | yes | | |
| `isActive` | BOOLEAN | no | true | |

`FacilityClosureDay` (no ownership stamps):

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `closurePlanId` | UUID | no | | FK -> FacilityClosurePlan. |
| `closureDate` | DATEONLY | no | | |
| `startTime` | TIME | yes | | Per-day override; both NULL = all day. |
| `endTime` | TIME | yes | | |
| `isActive` | BOOLEAN | no | true | Unticked = this day is excepted. |

#### Slice 1 screens and API

- `/facility/settings` - **Facility Specification** (`apps/web/src/app/facility-settings`): settings-card groups *Booking Window*, *Sessions* (array editor), *Guest Control* (switch + the four allow flags), *Cancellation and No-show* (switch + notice hours); field-info popovers, sticky save bar, route-leave guard; ONE `PUT /settings` carries the scalars and the sessions.
- `/facility/facility-types` - **Facility Types** (`facility-types`): listing with a usage-mode filter row and search (code, description, mode chip, unit and slot-set counts, rule summary, type icon) + ONE drawer with four views - the type form (sections show and hide by usage mode; the mode select is disabled once units exist; icon upload), the slot-set list, the slot-set form (the Save button states the slot count it will generate; edit offers *Regenerate*) and the slot editor (regenerate from the header via the server's preview, untick a break, flag front-desk-only).
- `/facility/facilities` - **Facilities** (`facilities`): listing with a type filter row and search (picture or mode glyph, type chip, location, Indoor / Floodlit chips, capacity) + drawer (type fixed on edit; capacity only for entry types; picture upload); the row kebab's *Closures* jumps to the Closures screen with the unit preselected.
- `/facility/closures` - **Facility Closures** (`facility-closures`): every plan across types and units, newest period first; ONE drawer with the plan form (type select, unit multi-select - none ticked = the whole type, several = one plan each) and the generated-day editor (the golf Course Closure shape); arriving with `?facilityTypeId=&facilityId=` opens the create form preselected.
- API under `/api/facility` (every route `verifyToken` + `requireModule('FACILITY')`, per-screen menu gates, `validate()` with a `*.schemas.js` beside each controller; reads of types pass on the Facilities and Closures grants, reads of units on the Closures grant): `GET /meta` (usage modes, day scopes, limits), `GET|PUT /settings` (sessions inside the body), `GET|POST|PATCH|DELETE /facility-types(/:id)`, `POST /facility-types/icon`, `GET /facility-types/:id/slot-sets`, `POST .../slot-sets/preview` (the header's generated slots, unsaved), `POST .../slot-sets` (header + generated slots in one transaction), `PATCH .../slot-sets/:setId` (header, `isActive`, `regenerate`), `PUT .../slot-sets/:setId/slots`, `DELETE .../slot-sets/:setId`, `GET|POST|PATCH|DELETE /facilities(/:id)` (`?facilityTypeId=` filter), `POST /facilities/picture`, `GET|POST|PATCH|DELETE /closure-plans(/:planId)`, `POST /closure-plans/:planId/generate-days`, `PUT /closure-plans/:planId/days`.
- Slot generation is the pure `slotSet.service.js` (`generateSlots`, unit-tested): first start in steps of the slot length while the start is on or before the last start, the end must not pass midnight, at most 200 slots, front-desk-only from `frontDeskFrom`.
- Deletion guards: a type is refused while units exist (slot sets and closure plans cascade); a unit is refused while a closure plan names it; a unit never moves to another type; the usage mode is refused once units exist (and once slot sets exist unless the new mode is `slot`).
- Menus are DB rows the user adds under the Facility module (`FACILITY`) with routes `/facility/settings`, `/facility/facility-types`, `/facility/facilities`, `/facility/closures`; the dev seed's "Facilities Setup" `/facilities` and "Booking Rule Setup" `/booking-rules` placeholders under the Core module are superseded.
- Numbering: none in slice 1 (the `facility-*` series arrive with the documents in slices 2 and 3).

### Slice 2 - slot Booking with guest control and billing (FULL DETAIL, approved 2026-10-25; 2a, 2b and 2c BUILT 2026-10-25)

**Status:** 2a (Patron / OtherPatron models, Participant Types, Transaction Types with rate cards and cells, Payment Types, the facility numbering series, guest exception rules and membership-type overrides on the Specification, the default-fee pickers and approval switch on Facility Types, the Membership monthly allowance and GuestVisit ledger with its gateway) is built and smoked on dev (2026-10-25); 2b (Booking / BookingSlot / BookingParticipant / SlotLock, the availability engine, the nine rules, the Facility Bookings screen) is built and SMOKED on dev (2026-10-25: Tropicana BADMINTON, Monday 2 Nov 2026 grid, two-slot claim on BC1 with the consecutive rule refusing a gap, FB-00001 booked by MEM26-000001 with a visitor guest recorded on the Membership ledger, roster edited to two guests (ledger 2), cancelled outside the notice with both visits voided and the cells freed, FB-00002 rebooked and a third slot refused by the weekday limit of 2 on both the screen and the server; FB-00002 stays as test residue); 2c (Bill / BillItem / BillPayment, the pricing engine on the rate cards, the bill endpoints and the bill and settle views in the bookings drawer) is built and SMOKED on dev (2026-10-26: FBL- bill series added, FBL-00001 opened on FB-00002 with the two per-slot BADM lines at 20.00, GUESTFEE refused for its missing price card, quantity amended, a line removed, settled with CASH 40.00; the member and debtor tenders are not yet exercised on dev - no AR invoice type is opened to Facility on Tropicana).

**2c as built (2026-10-25):**

- Opening the bill auto-charges the Facility Type's default fees: the facility fee is the type's explicit pick, else the active facility-fee item flagged as the default for the booker's category (member, or guest for a visitor), the one scoped to this facility type beating a general one; a `per-slot` basis writes one line per slot priced on that slot's own session, any other basis one line on the first slot. The guest fee goes once per guest-like roster line (quantity = the slot count when its basis is `per-slot`), priced by that participant's own type; the line carries the participant id.
- A missing price REFUSES the open (rule 9) naming the card date or the cell (participant type / day type / session); a type with `allowPriceOverride` lands at 0.00 for the desk to key instead. A missing default item is a warning on the opened bill, not a refusal.
- Tiles are the active transaction types scoped to this facility type or to none, minus packages, deposits and no-show charges; a manual line prices by the item's own participant type, else the booker's category, on the first slot's day type and session.
- Settlement: several tenders whose sum equals the total; `member` posts to the booker's AR account (the booker must be a member whose status allows charging; charge target through the Membership seam), `debtor` posts to the picked AR Other Debtor, both through the ONE AR invoice transaction type opened to the Facility module with credit enforced; `suspend` and the cash-like classes just record. The AR document is the plain receivable; the facility bill owns the tax accounting (the tax seam quotes each line).
- Void: open bills only; the booking may then be billed again. The booking DTOs carry the live bill summary.
- API built: `POST /bookings/:id/bill` (open or fetch), `GET /bills/:billId`, `POST /bills/:billId/items`, `PUT /bills/:billId/items/:itemId`, `DELETE /bills/:billId/items/:itemId`, `POST /bills/:billId/settle`, `POST /bills/:billId/void`; the pure pricing in `billPricing.service.js` (unit-tested), the engine in `billing.service.js`.

**2b as built (2026-10-25):**

- The roster is keyed ONCE per booking and written on every slot of it; a guest visit is recorded once per guest line, on the first slot's participant row, so a two-slot booking with one guest is ONE visit on the host's allowance (voided and re-recorded when the roster is edited).
- The desk is the booking channel today: front-desk-only slots are offered to it (reported as `front-desk` on the grid; the member portal will skip them), and the booker's window binds the desk too (a visitor takes the general rule).
- Guest resolution: a matching exception row decides on its own; with none, the type's policy AND the general day-type flags both have to allow (the type can only tighten the club rule).
- Claiming re-sends the WHOLE selection (an existing group is replaced), so the consecutive rule and the cap speak at every click; the claim expires after `bookingLockMinutes` and the screen counts it down.
- Approval codes are `facility-type` (the type requires approval) and/or the requires-approval participant type codes; the Workflow purpose is `facility-booking` (entity `FacilityBooking`, the bell opens `/facility/bookings`); the handlers in `wiring/workflowHandlers.js` book or cancel the held booking.
- Emails: catalog templates `facility.booking.confirmed` / `pending` / `rejected` / `cancelled`, ONE email to the contact address, the booker's member email and every member participant's email.
- API built: `GET /bookings/meta`, `GET /bookings/context?memberNo&facilityTypeId&date`, `GET /bookings/availability?facilityTypeId&date`, `POST /bookings/locks` (claim or re-claim a group), `DELETE /bookings/locks/:groupId`, `GET /bookings?date&facilityTypeId`, `GET /bookings/search?q`, `POST /bookings`, `GET /bookings/:id`, `GET /bookings/:id/cancel-preview`, `POST /bookings/:id/cancel`, `PUT /bookings/:id/participants`, `GET /patrons?q`, `POST /patrons` (visitor); all behind the `/facility/bookings` menu grant.
- The pure rules live in `bookingRules.service.js` (unit-tested); the DB-backed loaders and the grid builder in `bookingAvailability.service.js`.

#### `facility.Patron` + `facility.OtherPatron` - the person identity

`Patron` (model `FacilityPatron`, table `facility."Patron"`, unique `(companyId, patronType, sourceId)`, index `(companyId, name)`) mirrors `golf.Golfer`: one thin row per person who books, participates, registers or is issued an item; every downstream row references `patronId`.
Created lazily at first booking or registration; a visitor who joins the club is re-pointed (`other` -> `member`) keeping the same `patronId`.
The profile lives at the source: a member's standing, charge target and guest allowance are asked live through `membershipGateway`, never stored.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `patronType` | STRING(10) | no | | `member` (sourceId = membership `Member.id`) or `other` (sourceId = `OtherPatron.id`). |
| `sourceId` | UUID | no | | Polymorphic profile ref, validated in the service, no FK. |
| `name` | STRING | no | | Display and search snapshot, refreshed from the source. |
| `memberNo` | STRING(50) | yes | | Snapshot, member kind only. |
| `remarks` | TEXT | yes | | Desk notes (bans, VIP). |
| `isActive` | BOOLEAN | no | true | |

`OtherPatron` (model `FacilityOtherPatron`, table `facility."OtherPatron"`, indexes on `(companyId, identityNo)`, `(companyId, mobile)`, `(companyId, name)`) mirrors `golf.OtherGolfer`: the facility-owned visitor profile, deduped by identity number or mobile on creation.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `name` | STRING | no | | Full name as keyed at the desk. |
| `identityNo` | STRING | yes | | IC or passport, the dedupe key (indexed, not unique). |
| `gender` | STRING | yes | | |
| `birthDate` | DATEONLY | yes | | |
| `nationalityCode` | STRING | yes | | Subscriber Nationality code. |
| `mobile` | STRING | yes | | One combined string (app phone standard). |
| `email` | STRING | yes | | |
| `isActive` | BOOLEAN | no | true | |

#### `facility.ParticipantType` - the participant catalog

Model `FacilityParticipantType`, table `facility."ParticipantType"`, unique `(companyId, code)`; the shape of `golf.PlayerType`.
Three SYSTEM rows per company are seeded lazily with locked codes (`member`, `member-guest`, `guest`); the club adds its own (a JUNIOR or CORPORATE guest priced differently).
The `code` is the key every participant line and every rate cell carries; `baseIdentity` is how the engine treats the type.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `code` | STRING(20) | no | | Upper case for club types; the three system codes stay lower case. |
| `description` | STRING | no | | |
| `baseIdentity` | STRING(20) | no | | `member` / `member-guest` / `guest`. |
| `requiresApproval` | BOOLEAN | no | false | A booking carrying this type routes through the `facility-booking` approval chain. |
| `isSystem` | BOOLEAN | no | false | Code locked, never deleted or disabled. |
| `isActive` | BOOLEAN | no | true | |
| `sortOrder` | INTEGER | no | 100 | |

#### `facility.TransactionType` + `facility.TransactionTypeRate` + `facility.TransactionTypeRateCell` - the billing-item catalog and its rate cards

`TransactionType` (model `FacilityTransactionType`, table `facility."TransactionType"`, unique `(companyId, transactionType)`) mirrors golf's: the single source of the tax scheme for a billing item.
Packages (element lines, auto balance line, eligibility) and deposits are NOT built in slice 2; their charge-type keys are reserved so the vocabulary never changes.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `transactionType` | STRING(50) | no | | The code ('BADM', 'GUEST', 'LOCKER'). |
| `chargeType` | STRING(20) | no | | `facility-fee` / `guest-fee` / `issue-fee` / `class-fee` / `no-show` / `miscellaneous` / `package` / `deposit`. |
| `feeBasis` | STRING(20) | no | 'per-slot' | `per-slot` (one line per reserved slot: court hire), `per-participant` (one line per matching participant: a guest fee), `per-booking` (one line per booking: a hall deposit later). |
| `facilityTypeId` | UUID | yes | | The type this fee belongs to; NULL = usable on any type. Intra-service value ref. |
| `description` | STRING | yes | | |
| `participantType` | STRING(20) | yes | | Default-charge target: the participant category this fee is auto-charged for (`facility-fee` and `guest-fee` only, at most one active default per type and category); NULL = a manual item. |
| `taxSchemeCode` | STRING | yes | | Tax scheme by code via the tax seam; NULL = no tax. |
| `allowPriceOverride` | BOOLEAN | no | false | Cashier may amend the resolved price. |
| `iconUrl` | STRING | yes | | Billing tile icon. |
| `isActive` | BOOLEAN | no | true | |

`TransactionTypeRate` (model `FacilityTransactionTypeRate`, table `facility."TransactionTypeRate"`, unique `(transactionTypeId, effectiveDate)`, FK cascades with the type): the effective-dated price card; resolution = the active card with the latest effective date on or before the booking date.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `transactionTypeId` | UUID | no | | FK -> TransactionType. |
| `effectiveDate` | DATEONLY | no | | |
| `flatAmount` | DECIMAL(21,2) | yes | | Flat charge types (`no-show` / `miscellaneous` / `issue-fee` / `class-fee`); NULL on matrix types. |
| `isActive` | BOOLEAN | no | true | |

`TransactionTypeRateCell` (model `FacilityTransactionTypeRateCell`, table `facility."TransactionTypeRateCell"`, unique `(rateId, participantType, dayScope, sessionId)`, FK cascades with the card): the matrix of a `facility-fee` or `guest-fee` card as ROWS, because the axis is participant type x day type x session band and the club's sessions are its own.
Resolution for a slot: the cell whose `participantType` matches, with an exact `sessionId` outranking NULL and an exact day scope outranking `all`; no cell = no price (the line is refused, never silently zero).
Cells are PUT-replaced with the card; the editor shows them as a grid (participant types down, day scope x session across).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `rateId` | UUID | no | | FK -> TransactionTypeRate. |
| `participantType` | STRING(20) | no | | A ParticipantType code. |
| `dayScope` | STRING(10) | no | 'all' | `all` / `weekday` / `weekend` (holidays = weekend). |
| `sessionId` | UUID | yes | | A FacilitySession; NULL = any session. Value ref (a deleted session leaves the cell unmatched). |
| `amount` | DECIMAL(21,2) | no | | Tax-exclusive. |

No ownership stamps on the cell rows (replaced with the card, like golf's rate cells).

#### `facility.PaymentType` - the tender catalog

Model `FacilityPaymentType`, table `facility."PaymentType"`, unique `(companyId, paymentType)`; golf's shape.
Classes (facility `paymentType.constants`): `cash` / `creditcard` / `member` / `debtor` / `voucher` / `staff` / `online` / `suspend`; `member` posts to the billed member's own account and `debtor` to a chosen AR Other Debtor through `arGateway.postCharge` with credit enforcement.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `paymentType` | STRING(50) | no | | The code ('CASH', 'VISA'). |
| `paymentClass` | STRING(20) | no | | One of the classes above. |
| `description` | STRING | yes | | |
| `iconUrl` | STRING | yes | | Settlement tile icon. |
| `isActive` | BOOLEAN | no | true | |

#### `facility.NumberingScheme` - the facility series

The shared `defineNumberingScheme` shape (model `FacilityNumberingScheme`, table `facility."NumberingScheme"`), purposes `facility-booking` (issued at confirm) and `facility-bill` (issued at bill creation); `facility-registration` joins in slice 3.
Maintained at `/facility/numbering`; the gateway routes `facility-*` purposes here.

#### `facility.GuestControlRule` - guest exceptions

Model `FacilityGuestControlRule`, table `facility."GuestControlRule"`, index `(companyId)`; golf's shape with the facility type in place of the course.
The general flags live on the Specification and the per-type policy on the Facility Type; these sparse rows exist only where a type, day type or time band needs a different answer (no visitor guests on badminton at weekends before noon).
Resolution: most specific wins (specific type > every type; a specific weekday > weekday/weekend > all; time band > whole day); no match falls back to the Facility Type policy, then the Specification flags.
Rows are stored while the master switch is OFF and take effect while it is ON; PUT-replaced from the Specification.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `facilityTypeId` | UUID | yes | | A specific type; NULL = every type. Value ref. |
| `dayScope` | STRING(10) | no | 'all' | `all` / `weekday` / `weekend` / `monday`..`sunday`. |
| `startTime` | TIME | yes | | Band, both or neither; a slot's START falls in [start, end). |
| `endTime` | TIME | yes | | |
| `allowGuest` | BOOLEAN | no | true | Visitor guests allowed in this scope. |
| `allowMemberGuest` | BOOLEAN | no | true | Members as guests allowed in this scope. |

#### `facility.AdvanceBookingOverride` - earlier windows per membership type

Model `FacilityAdvanceBookingOverride`, table `facility."AdvanceBookingOverride"`, unique `(companyId, membershipTypeId)`; behind the new `FacilitySetting.allowMembershipTypeOverride` switch (slice 2 column); `membershipTypeId` is a gateway-validated value ref.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `membershipTypeId` | UUID | no | | |
| `advanceBookingDays` | INTEGER | no | | Replaces the general and the type's days for members of this membership type. |

Resolution of the window for a booking: the membership-type override when the switch is ON and a row exists, else the Facility Type's `advanceBookingDays`, else the Specification's general days; the early-opening hours are always the Specification's.

#### `facility.Booking` + `facility.BookingSlot` + `facility.BookingParticipant` - the booking

`Booking` (model `FacilityBooking`, table `facility."Booking"`, unique `(companyId, bookingNo)`, indexes `(companyId, bookerPatronId)`, `(companyId, status)`): the header, booker info and lifecycle only; the reservation itself is the slot rows, so availability counts physical slot occupancy.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `bookingNo` | STRING(50) | no | | From the `facility-booking` series at confirm. |
| `facilityTypeId` | UUID | no | | One booking = one facility type (its limits and fees). Intra-service FK. |
| `bookerPatronId` | UUID | no | | The booking maker's Patron (member or visitor). |
| `contactMobile` | STRING(30) | yes | | |
| `contactEmail` | STRING(255) | yes | | Confirmation and cancellation emails. |
| `remarks` | STRING | yes | | |
| `status` | STRING(20) | no | 'booked' | `booked` / `pending-approval` / `cancelled` (facility `booking.constants`). |
| `workflowInstanceId` | UUID | yes | | The approval run when a participant type requires approval (Workflow purpose `facility-booking`; no chain configured = booked at once). |
| `channel` | STRING(10) | no | 'desk' | `desk` now, `portal` when the member portal books. |
| `cancelledAt` | DATE | yes | | |
| `cancelledBy` | UUID | yes | | |
| `cancelReason` | STRING | yes | | |
| `isLateCancel` | BOOLEAN | no | false | Cancelled inside the notice window while no-show control is ON; slice 4 prices it. |

`BookingSlot` (model `FacilityBookingSlot`, table `facility."BookingSlot"`, FK cascades with the booking; partial unique `(facilityId, bookingDate, startTime) WHERE status <> 'cancelled'` so a slot is never double-booked; indexes `(companyId, bookingDate)`, `(companyId, facilityTypeId, bookingDate)`): one row per reserved slot.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `bookingId` | UUID | no | | FK -> Booking. |
| `facilityTypeId` | UUID | no | | Denormalised for the per-type limit counts. |
| `facilityId` | UUID | no | | The unit. Intra-service FK. |
| `bookingDate` | DATEONLY | no | | |
| `startTime` | TIME | no | | From the type's slot set in force on that date. |
| `endTime` | TIME | no | | |
| `slotNumber` | INTEGER | no | | The slot's number in its set (display). |
| `sessionId` | UUID | yes | | The Facility Session the start falls in at booking time (pricing snapshot); NULL = none. |
| `dayType` | STRING(10) | no | | `weekday` / `weekend` as classified at booking time (holidays = weekend). |
| `status` | STRING(20) | no | 'booked' | `booked` / `checked-in` / `no-show` / `cancelled` (`checked-in` and `no-show` are set by slices 3 and 4). |
| `checkedInAt` | DATE | yes | | Slice 3. |
| `cancelledAt` | DATE | yes | | A single slot dropped from a booking. |

`BookingParticipant` (model `FacilityBookingParticipant`, table `facility."BookingParticipant"`, FK cascades with the slot, index `(bookingSlotId)`, index `(companyId, patronId)`): the people on a slot.
A member participant is a Patron; a visitor guest may be a Patron (found or created) or a plain name when the desk keys a casual guest.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `bookingSlotId` | UUID | no | | FK -> BookingSlot. |
| `patronId` | UUID | yes | | NULL for a named casual guest. |
| `participantType` | STRING(20) | no | | A ParticipantType code. |
| `name` | STRING | no | | Snapshot. |
| `memberNo` | STRING(50) | yes | | Snapshot, members only. |
| `isHost` | BOOLEAN | no | false | The member whose guest allowance the guests draw on (the booker by default). |
| `guestVisitId` | UUID | yes | | The `membership.GuestVisit` row recorded for a guest line (value ref across the seam). |
| `sortOrder` | INTEGER | no | 1 | |

#### `facility.SlotLock` - the claim while keying

Model `FacilitySlotLock`, table `facility."SlotLock"`, unique `(companyId, facilityId, bookingDate, startTime)`, index `(groupId)`; golf's `FlightLock` with the slot in place of the flight.
Clicking slots on the grid claims them for `bookingLockMinutes`; confirm converts the group's locks into BookingSlot rows inside one transaction; expiry and cancel release them.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `groupId` | UUID | no | | The one booking being keyed (several slots share it). |
| `facilityId` | UUID | no | | |
| `bookingDate` | DATEONLY | no | | |
| `startTime` | TIME | no | | |
| `expiresAt` | DATE | no | | |
| `lockedBy` | UUID | no | | The user keying. |

No ownership stamps (short-lived, like FlightLock).

#### `facility.Bill` + `facility.BillItem` + `facility.BillPayment` - billing

`Bill` (model `FacilityBill`, table `facility."Bill"`, unique `(companyId, billNo)`, indexes `(companyId, billDate)`, `(bookingId)`): ONE bill per booking, payable by the booker, opened by the desk from the booking (slice 2) or at check-in (slice 3); golf's engine with the per-player and group variants removed.
Opening a bill auto-charges the Facility Type's default fees: the `facility-fee` default once per slot (`per-slot`) and the `guest-fee` default once per guest participant (`per-participant`), each priced from its rate card for the slot's day type, session and participant type.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `billNo` | STRING(50) | no | | From the `facility-bill` series at creation. |
| `bookingId` | UUID | no | | The booking billed (one open or settled bill per booking; a voided bill may be re-opened). |
| `patronId` | UUID | no | | The payer, the booker's Patron. |
| `billDate` | DATEONLY | no | | |
| `totalAmount` | DECIMAL(21,2) | no | 0 | Maintained by the engine: items plus exclusive tax. |
| `taxTotal` | DECIMAL(21,2) | no | 0 | |
| `status` | STRING(20) | no | 'open' | `open` / `settled` / `voided`. |
| `remarks` | STRING | yes | | |
| `settledAt` | DATE | yes | | |
| `voidedAt` | DATE | yes | | |
| `voidedBy` | UUID | yes | | |
| `voidReason` | STRING | yes | | |

`BillItem` (model `FacilityBillItem`, table `facility."BillItem"`, FK cascades with the bill, index `(billId)`):

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `billId` | UUID | no | | |
| `sortOrder` | INTEGER | no | | |
| `transactionTypeId` | UUID | no | | |
| `bookingSlotId` | UUID | yes | | The slot the line belongs to (per-slot and per-participant lines); NULL on booking-level and manual lines. |
| `bookingParticipantId` | UUID | yes | | The participant a per-participant line is for. |
| `description` | STRING | no | | Code + description snapshot. |
| `quantity` | INTEGER | no | 1 | |
| `unitAmount` | DECIMAL(21,2) | no | 0 | |
| `amount` | DECIMAL(21,2) | no | 0 | quantity x unitAmount after any permitted override. |
| `priceOverridden` | BOOLEAN | no | false | |
| `taxSchemeCode` | STRING | yes | | Tax snapshot, as golf. |
| `taxAmount` | DECIMAL(21,2) | no | 0 | |
| `taxBreakdown` | JSONB | yes | | |

`BillPayment` (model `FacilityBillPayment`, table `facility."BillPayment"`, FK cascades with the bill, index `(billId)`): several tenders until the total is met; `member` and `debtor` classes post the amount to AR and snapshot the document here.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `billId` | UUID | no | | |
| `sortOrder` | INTEGER | no | | |
| `paymentTypeId` | UUID | no | | |
| `paymentClass` | STRING(20) | no | | Class snapshot. |
| `amount` | DECIMAL(21,2) | no | | |
| `reference` | STRING(100) | yes | | Card approval, voucher number. |
| `arDocId` | UUID | yes | | AR posting snapshot (account classes). |
| `arDocNo` | STRING(50) | yes | | |
| `debtorType` | STRING(20) | yes | | |
| `debtorSourceId` | UUID | yes | | |

#### Specification and Facility Type columns added in slice 2

- `FacilitySetting.allowMembershipTypeOverride` (BOOLEAN, default false) - the AdvanceBookingOverride switch.
  The `bookingLimitScope` column named in the slice-1 draft is dropped: the per-type slots-per-day limits already carry the day type, and a per-session limit is not asked for.
- `FacilityType.feeTransactionTypeId` (UUID, nullable) - the `facility-fee` auto-charged per slot; `FacilityType.guestFeeTransactionTypeId` (UUID, nullable) - the `guest-fee` auto-charged per guest participant; `FacilityType.requiresApproval` (BOOLEAN, default false) - every booking of the type routes through the approval chain.

#### Membership additions (owned by Membership)

- `MembershipType.monthlyGuestAllowance` (INTEGER, nullable; NULL = no limit, 0 = none) - the club-wide guests a member of this type may bring per calendar month, across every module.
  The existing `guestQuota` keeps its golf per-booking meaning and label; the Membership Types screen shows the new field beside it as "Monthly guest allowance (all facilities)".
- `membership.GuestVisit` (model `GuestVisit`, table `membership."GuestVisit"`, indexes `(companyId, memberId, visitDate)`, unique `(sourceModule, sourceRef)`): the guest-usage ledger every producer writes through the seam.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `memberId` | UUID | no | | The HOST member whose allowance the visit draws on. |
| `visitDate` | DATEONLY | no | | The booking or visit date (the month counted). |
| `sourceModule` | STRING(20) | no | | `facility` / `golf`. |
| `sourceRef` | UUID | no | | The producer's line (facility: the BookingParticipant id). |
| `guestName` | STRING | yes | | Display. |
| `guestCount` | INTEGER | no | 1 | |
| `status` | STRING(20) | no | 'confirmed' | `confirmed` / `voided`. |
| `voidedAt` | DATE | yes | | |

Gateway (`platform/membershipGateway.js`): `getGuestAllowanceStanding(companyId, memberId, date)` -> `{ allowance, used, remaining }` for the calendar month of `date` (club-local) counting `confirmed` visits; `recordGuestVisit(companyId, { memberId, visitDate, sourceModule, sourceRef, guestName, guestCount, stamps }, { transaction })`; `voidGuestVisit(companyId, sourceModule, sourceRef, { transaction })`.
Facility records a visit per guest participant when the booking is confirmed (inside the booking transaction, so an exhausted allowance refuses the booking), voids it when the booking or that participant is cancelled, and leaves it when the guest fails to show.
Golf is wired to the same ledger in a later golf slice; nothing in golf changes now.

#### Booking rules (binding, enforced in the booking channel; the desk warns where golf's desk warns)

1. **Window**: date D is bookable from 00:00 of (D - effective days) minus the early-opening hours, club-local; effective days resolve override > type > general; same-day booking needs the Specification switch.
2. **Slots per day**: the booker and every member participant count the slots of the type they hold on that date (booked or checked-in); a booking that would push anyone past `maxSlotsPerDayWeekday/Weekend` is refused with the person named.
3. **Consecutive**: the slots of one booking on one facility must be adjacent and at most `maxConsecutiveSlots`; a booking may not span two facilities.
4. **Participants**: between `minParticipants` and `maxParticipants` per slot when tracked.
5. **Guests**: while guest control is ON - the resolved rule (exception > type policy > general flags) decides whether visitor guests and member-guests are allowed; `maxGuestsPerBooking` caps the visitor guests across the booking; each guest draws on the host member's monthly allowance through the seam; `hostMustBePresent` requires the host as a participant.
6. **Closures and locks**: a slot inside an active closure day, outside the slot set, front-desk-only (booking channel) or locked by another user is not offered.
7. **Member standing**: a member whose status `actionControl` is `barred` cannot book; `warning` books with the standing shown.
8. **Cancellation**: any time while no-show control is OFF; inside the notice window with it ON the cancel is recorded as `isLateCancel` (slice 4 prices it); cancelling voids the guest visits and releases the slots.
9. **Billing**: the bill opens from the booking (desk) with the default fees priced from the rate cards; a line with no matching rate cell is refused with the cell named; settlement follows golf (several tenders, account classes post to AR with credit enforcement, `suspend` counts toward settlement).

#### Slice 2 screens and API

- `/facility/bookings` - **Facility Bookings**: the day grid of one facility type (facilities across, the day's slots down; closed, front-desk, locked and booked cells distinguished), date and type pickers, click slots to claim, a drawer to key the booker and the participants with the rule checks shown before confirm, a booking detail view (slots, participants, bill, cancel), search by booking number or name.
- `/facility/transaction-types`, `/facility/payment-types`, `/facility/participant-types`, `/facility/numbering` - the catalogs (golf's screens adapted; the rate-card editor is the participant x day scope x session grid).
- Facility Specification gains *Guest rules* (the exception editor) and *Membership type overrides*; Facility Types gains the two default-fee pickers and the approval switch; Membership Types gains the monthly guest allowance.
- API under `/api/facility`: `patrons` (search, create visitor), `participant-types`, `transaction-types` (+ `/:id/rates`, cells inside the card), `payment-types`, `numbering-schemes`, `bookings` (`availability?facilityTypeId&date`, `locks` claim/release, create, get, cancel, `/:id/participants`, `/:id/bill` open), `bills` (`/:id/items`, `/:id/payments`, void); membership adds `GET /api/membership/members/:id/guest-allowance` for the member screen.

### Slice 3 - Control Station (FULL DETAIL, approved 2026-10-26; BUILT and SMOKED on dev 2026-10-26)

**Status:** approved as drafted and built 2026-10-26 (models, the station engine in station.service.js with the pure verdicts in stationRules.service.js (unit-tested), the station controller and routes under /api/facility/station, the worker auto sign-out tick, the Control Station screen at /facility/station, the Specification and Facility Types fields, the bill re-keyed to a booking, a registration or an issue); smoked on dev 2026-10-26 (Tropicana: RG- registration series added, GYM entry refused a visitor guest by the type policy and registered Ahmad as RG-00001 at 1 of 40, LOCKER units L001/L002 added, L001 issued and a second unit refused by the per-member limit, damaged return parked L001 and the board cleared it, GYM end of day signed Ahmad out, FB-00003 at 10:00 checked in as RG-00002 with the absent guest dropped and the ledger returned from 2 to 1, the station's bill deep link reached the bookings drawer; a refused bill open had left an empty bill, now fixed by rolling back). Built as drafted with one implementation note: the station opens bills through the bookings screen's one bill drawer (deep links ?billId= and ?openBillFor=), so there is a single bill UI.
The station is the desk's live screen for the day: check in the booked slots of the slot types, register entries on the entry types against the live capacity, issue and return the units and consumables of the issue types, and clear what is still open at the end of the day.
Three tables carry it - the registration (one row per person in a facility), its guests, and the issue record - plus two columns on `Facility`, a few columns on the Specification and the Facility Type, and the `facility-registration` numbering series.
Decisions proposed here and open for your change: a visitor enters an entry type only as the GUEST of a member's registration (no standalone visitor entry, so the guest rules and the monthly allowance keep covering every non-member in the building); a booked slot is checked in from `checkInOpenMinutes` before its start until its END (a late arrival still plays the rest; the no-show verdict after start plus grace is slice 4's); a bill may now hang off a registration or an issue record as well as a booking, so the station bills a walk-in entry and an issue fee through the slice 2 engine unchanged.

#### `facility.Registration` - one person in a facility

Model `FacilityRegistration`, table `facility."Registration"`, unique `(companyId, registrationNo)`, indexes `(companyId, facilityTypeId, registrationDate)`, `(companyId, patronId, registrationDate)`, partial unique `(bookingSlotId) WHERE bookingSlotId IS NOT NULL` (a slot is checked in once).
One row per check-in of a booked slot or per walk-in entry; the slot types create it at check-in, the entry types at the door.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `registrationNo` | STRING(50) | no | | From the `facility-registration` series at registration. |
| `patronId` | UUID | no | | The member (or, for a booked slot, the booker) registering. Visitors never register on their own - they are RegistrationGuest rows. |
| `facilityTypeId` | UUID | no | | Intra-service FK. |
| `facilityId` | UUID | yes | | The unit: the court of a checked-in slot, a specific pool; NULL = the type as a whole (the gym counted under the type's capacity). Intra-service FK, RESTRICT. |
| `bookingSlotId` | UUID | yes | | The slot checked in; NULL = a walk-in entry. The slot's status flips to `checked-in` in the same transaction. |
| `registrationDate` | DATEONLY | no | | The club-local date (the day's register, the capacity window). |
| `timeIn` | DATE | no | | Timestamp of arrival. |
| `timeOut` | DATE | yes | | Timestamp of sign-out; NULL = still inside. The end-of-day sweep stamps the type's close time. |
| `dayType` | STRING(10) | no | | `weekday` / `weekend` as classified at registration (the guest rule and the fee cell). |
| `sessionId` | UUID | yes | | The Facility Session `timeIn` falls in (the fee cell); NULL = none. |
| `guestCount` | INTEGER | no | 0 | Denormalised count of RegistrationGuest rows (the live capacity count adds it). |
| `status` | STRING(10) | no | 'in' | `in` / `out`. A booked slot never reached has no registration; its slot carries `no-show` (slice 4). |
| `billId` | UUID | yes | | The bill a walk-in entry opened (the facility fee per entry + the guest fees); a checked-in slot bills on its booking's bill instead and keeps NULL here. |
| `remarks` | STRING | yes | | |
| `createdBy` / `createdByDepartmentId` / `updatedBy` | UUID | yes | | Ownership stamps. |

#### `facility.RegistrationGuest` - the guests on an entry

Model `FacilityRegistrationGuest`, table `facility."RegistrationGuest"`, FK cascades with the registration, index `(registrationId)`, index `(companyId, patronId)`.
The same shape as BookingParticipant's guest lines, so a guest at the pool draws one visit on the host's monthly allowance exactly as a guest on a court does.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `registrationId` | UUID | no | | FK -> Registration. |
| `patronId` | UUID | yes | | The visitor's Patron when the desk keyed an IC or mobile (found or created); NULL for a casual name. A member-as-guest line carries the member's Patron. |
| `participantType` | STRING(20) | no | | A ParticipantType code of a guest-like base (`guest` or `member-guest` identity). |
| `name` | STRING | no | | Snapshot. |
| `memberNo` | STRING(50) | yes | | Snapshot, member-as-guest only. |
| `guestVisitId` | UUID | yes | | The `membership.GuestVisit` recorded for the line (value ref across the seam); voided if the line is removed before sign-out, kept after. |
| `sortOrder` | INTEGER | no | 1 | |

#### `facility.IssueRecord` - one issue of a unit or a quantity

Model `FacilityIssueRecord`, table `facility."IssueRecord"`, indexes `(companyId, facilityTypeId, status)`, `(companyId, patronId, status)`, `(facilityId)`.
One row per locker issued (trackUnits ON: the unit) or per quantity of a consumable handed out (trackUnits OFF: towels, quantity N).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `patronId` | UUID | no | | The member holding it (a visitor holds nothing in their own name - the host member does). |
| `facilityTypeId` | UUID | no | | Intra-service FK. |
| `facilityId` | UUID | yes | | The unit issued (trackUnits ON); for a consumable the type's single counter row, so the column is never NULL in practice but stays nullable for a type with no row. RESTRICT. |
| `registrationId` | UUID | yes | | The entry the issue belongs to (a locker taken on the way into the gym), for the end-of-day view; NULL when issued on its own. |
| `quantity` | INTEGER | no | 1 | 1 for a unit; the pieces for a consumable. |
| `issuedAt` | DATE | no | | |
| `dueBack` | DATE | no | | `issuedAt`'s date plus the type's `issueDueDays` at the type's close time (or end of day); the board flags overdue rows. |
| `returnedAt` | DATE | yes | | NULL = still out. |
| `returnedQuantity` | INTEGER | yes | | Consumables may come back short; the difference is lost. |
| `returnCondition` | STRING(10) | yes | | `good` / `damaged` / `lost` at return (`lost` also when written off at the end of the day). |
| `status` | STRING(10) | no | 'issued' | `issued` / `returned` / `lost`. |
| `feeBillId` | UUID | yes | | The bill the issue fee opened (the type's `issueFeeTransactionTypeId`), when the type charges one; NULL = free issue. A deposit stays reserved (deposit charge type, not built). |
| `remarks` | STRING | yes | | Damage noted at return. |
| `createdBy` / `createdByDepartmentId` / `updatedBy` | UUID | yes | | Ownership stamps. |

#### Columns added in slice 3

- `Facility.unitStatus` (STRING(20), default `available`): `available` / `issued` / `out-of-service` for issue-mode units with trackUnits ON (a lost or damaged return parks the unit `out-of-service` until the desk clears it); other modes keep `available`.
  `Facility.currentIssueId` (UUID, nullable): the live IssueRecord while `issued`.
- `FacilitySetting.checkInOpenMinutes` (INTEGER, default 30): a booked slot is checked in from this many minutes before its start until its end.
  `FacilitySetting.autoSignOutAtClose` (BOOLEAN, default true): the end-of-day sweep stamps `timeOut` at the type's close time on every registration still `in`.
- `FacilityType.issueFeeTransactionTypeId` (UUID, nullable): the `issue-fee` auto-charged once per issue (trackUnits ON: per unit; OFF: quantity x the flat amount).
  `FacilityType.issueDueDays` (INTEGER, default 0): 0 = due back the same day at the type's close time.
  `FacilityType.entryRequiresBooking` (BOOLEAN, default false): an entry type that only admits a patron holding a booking of a linked slot type that day (a squash court entry desk) - off for the gym and the pool.
- `Bill.bookingId` becomes nullable and `Bill` gains `registrationId` (UUID, nullable) and `issueRecordId` (UUID, nullable): exactly one of the three is set (service rule), the unique index on the live bill moves to a partial unique per source.
- `NumberingScheme` purpose `facility-registration`, issued at every registration (check-in and walk-in).

#### Station rules (binding at the desk; the desk is the only channel)

1. **Check-in**: a `booked` slot of today checks in from `checkInOpenMinutes` before its start until its end, club clock; the registration names the booker as the patron and the slot's unit, the slot flips to `checked-in`, the booking's roster is shown for the desk to confirm who arrived (a guest who failed to show is dropped from the roster, which voids that guest visit).
2. **Entry**: a member registers on an entry type inside the type's opening hours for the day type, outside an active closure, and while the live count (registrations `in` plus their guests, under the unit's own capacity when it has one, else the type's) is below the capacity; a barred member is refused, a warning member registers with the standing shown; with `entryRequiresBooking` ON the member must hold a checked-in or booked slot of the linked type that day.
3. **Guests at the door**: the slice 2 guest resolver (exception > type policy > general flags) at `timeIn`, `maxGuestsPerBooking` as the per-visit cap, each guest-like line one visit on the member's monthly allowance through the seam, `hostMustBePresent` trivially met (the host is the one registering).
4. **Sign-out**: stamps `timeOut`; the live count drops; a registration with an open bill warns before sign-out and the desk settles or lets it stand (the bill stays open on the register's end-of-day list).
5. **Issue**: a member takes a unit (trackUnits ON: any `available` unit of the type, the desk picks from the board or the next free) or a quantity (OFF) while holding fewer than `maxIssuePerPatron` across the type, inside opening hours and outside a closure; the issue fee auto-charges on a bill of its own when the type names one; the unit goes `issued` with `currentIssueId` set.
6. **Return**: `good` frees the unit; `damaged` parks it `out-of-service` with the remark; `lost` (or a short consumable count) closes the record `lost`, parks the unit, and lists the loss for a manual charge (a miscellaneous or issue-fee tile on the fee bill) - no automatic penalty in this slice.
7. **End of day**: the sweep (a station action, and the worker at the type's close time when `autoSignOutAtClose` is ON) signs out every registration still `in` and lists the issues past `dueBack` as overdue; nothing is written off automatically.
8. **Billing**: a walk-in entry opens a bill at registration with the type's facility-fee default once (the `per-booking` basis reads as per entry; `per-slot` is refused on an entry type at setup) and the guest fee per guest line; a checked-in slot bills on its booking's bill; an issue bills its fee; the slice 2 settle and void paths apply unchanged.

#### Slice 3 screens and API

- `/facility/station` - **Control Station**: ONE screen for the day with the club clock, a type strip across the top (every active type grouped by mode) and four views: *Check-in* (the slot types: today's booked slots in time order, NEXT / OPEN / CLOSED tags by the clock, Check in opens the roster confirm, Bill jumps to the booking's bill), *Entry* (the entry types: the live count against the capacity, the register of who is in with time in and guests, Register opens the member-by-number form with guest lines under the rule checks, Sign out per row), *Issue* (the issue types: the unit board coloured by `unitStatus` or the counter with the pieces out, Issue opens the member form with the unit or quantity, Return per row with the condition), *End of day* (everything still in or out across the types, Sign out all, the overdue list).
  The station is its own menu, grantable to the desk without the setup screens.
- API under `/api/facility/station` (the `/facility/station` grant): `GET /today?date` (the day's picture per type: booked slots with their check-in state, entries with the live count, issues and units), `POST /check-ins` (bookingSlotId, the arrived roster), `POST /registrations` (facilityTypeId, facilityId, memberNo, guests), `POST /registrations/:id/sign-out`, `PUT /registrations/:id/guests`, `POST /issues` (facilityTypeId, facilityId or quantity, memberNo, registrationId), `POST /issues/:id/return` (condition, returnedQuantity, remarks), `POST /units/:id/clear` (out-of-service -> available), `POST /end-of-day` (facilityTypeId); the bill endpoints of slice 2 serve the station's bills.
- Menus the user adds: `/facility/station`.

### Slice 4 - No show (FULL DETAIL, approved 2026-10-26; BUILT and SMOKED on dev 2026-10-26)

**Status:** approved as drafted and built 2026-10-26 (the two models, the engine in noShow.service.js, the cancel flow with the charge or the refusal and the desk's waive, the station's No show mark with the end-of-day sweep on slot types, the No-show Charges and Booking Suspensions screens, the Specification fields and the two type switches, the worker expiry tick, the two email templates); smoked on dev 2026-10-26 (Tropicana: NOSHOW no-show item with a flat card of 20.00 from 2026-10-01, the Specification set to charge, per missed slot, grace 15, strikes 2 in 90 days for 30 days, BADMINTON charge and strike switches ON; the station showed No show on FB-00004 once 11:15 passed and recorded it as a pending 20.00 charge with the AR reason and the strike counted, Post repeated the reason, the Waive drawer offered the clear-strike option; FB-00005 cancelled inside the notice from the preview naming the 20.00 charge and raised a pending late-cancel row without a strike; with the action refuse, FB-00006 was refused and the desk's Cancel and waive drawer cancelled it with the row waived; a manual suspension on Ahmad refused his booking at confirm and was lifted with a reason; the FB-00005 row waived from its screen; BADMINTON End of day found 0 slots).
Not exercised on dev: the automatic strike suspension (one counted no-show against a strike count of 2) and the AR posting (no AR invoice type is opened to Facility on Tropicana).
Polish after the smoke: the booking context carries the active suspension so Check fails before the roster is keyed, the refusal wording no longer repeats the cancel-and-charge lines, the API messages name dates as text and the new-suspension flash uses the device format, and the card sublines drop the separator that led a wrapped line.
No-show control is the one master switch the Specification already carries (`noShowControlEnabled`, slice 1) with two consequences the kick-off decided: a CHARGE (a no-show transaction type priced from its flat card, posted to the booker's AR account, pending / posted / waived like golf) and a STRIKE rule (N no-shows in M days suspend booking for S days), each switchable per Facility Type.
Two tables carry it - the charge and the suspension - plus the detail columns on the Specification and the Facility Type.
Decisions proposed here and open for your change: a late cancellation is charged (or refused) at the moment of the cancel, a no-show is marked by the desk from the station's Check-in view once the slot's start plus the grace minutes have passed, and the slot type's End of day marks every still-booked slot past its end in one confirmed sweep; the strike is the no-show charge row itself (a late cancellation is charged but never a strike), waiving the money may keep or clear the strike, and a suspension is club-wide (every facility type) and bars BOOKING only - the member still enters the gym and takes a locker; a visitor booker's charge cannot post to AR and stays pending for the desk to collect on the booking's bill or waive.

#### `facility.NoShowCharge` - the penalty on a booking

Model `FacilityNoShowCharge`, table `facility."NoShowCharge"`, indexes `(companyId, status)`, `(companyId, bookingDate)`, `(companyId, bookerPatronId, bookingDate)`, `(bookingId)`; golf's table shape with the booking in place of the flight.
One row per penalised BOOKING (the basis decides the quantity), charged to the booker.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `bookingId` | UUID | no | | Intra-service FK, RESTRICT (a penalised booking is never deleted). |
| `bookingNo` | STRING(50) | no | | Snapshot. |
| `facilityTypeId` | UUID | no | | The type whose switches applied (snapshot for the listing and the strike count). |
| `bookingDate` | DATEONLY | no | | The booking's date (the strike window counts by it). |
| `chargeReason` | STRING(20) | no | | `no-show` / `late-cancel`. |
| `bookerPatronId` | UUID | no | | The patron charged. |
| `bookerName` | STRING | no | | Snapshot. |
| `bookerMemberNo` | STRING(50) | yes | | Snapshot; NULL for a visitor booker (the row then cannot post). |
| `slotSummary` | STRING | no | | 'BC2 18:00 - 20:00 (2 slots)' for the listing and the email. |
| `transactionTypeId` | UUID | yes | | The no-show transaction type priced; NULL when none was configured (the row is raised unpriced). |
| `description` | STRING | no | | Code + description snapshot, or 'No-show (unpriced)'. |
| `quantity` | INTEGER | no | 1 | By `noShowChargeBasis`: 1 per booking, the no-show slots, or the roster size. |
| `unitAmount` | DECIMAL(21,2) | no | 0 | The flat amount in force on the booking date. |
| `amount` | DECIMAL(21,2) | no | 0 | quantity x unitAmount. |
| `taxSchemeCode` | STRING | yes | | Tax snapshot, as a bill line. |
| `taxAmount` | DECIMAL(21,2) | no | 0 | |
| `taxBreakdown` | JSONB | yes | | |
| `totalAmount` | DECIMAL(21,2) | no | 0 | amount plus exclusive tax - what posts to AR. |
| `strikeCounted` | BOOLEAN | no | false | TRUE on a `no-show` row raised while the type's strike switch is ON; a waive may clear it. The strike window counts these rows. |
| `status` | STRING(20) | no | 'pending' | `pending` / `posted` / `waived`. |
| `arDocId` / `arDocNo` / `debtorType` / `debtorSourceId` | UUID / STRING(50) / STRING(20) / UUID | yes | | The AR invoice posted (member bookers). |
| `postedAt` / `postedBy` | DATE / UUID | yes | | |
| `waivedAt` / `waivedBy` / `waiveReason` | DATE / UUID / STRING | yes | | |
| `remarks` | STRING | yes | | Why a pending row did not post (visitor booker, no ledger account, charge barred, no price in force) - the listing shows it and offers Post again. |
| `createdBy` / `createdByDepartmentId` / `updatedBy` | UUID | yes | | Ownership stamps. |

#### `facility.PatronSuspension` - the strike outcome

Model `FacilityPatronSuspension`, table `facility."PatronSuspension"`, indexes `(companyId, patronId, status)`, `(companyId, status, toDate)`.
One row per suspension; at most one `active` per patron.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `patronId` | UUID | no | | The member suspended. |
| `patronName` / `memberNo` | STRING / STRING(50) | no / yes | | Snapshot. |
| `facilityTypeId` | UUID | yes | | NULL = every facility type (the proposed default); kept so a club may later scope a manual suspension to one type. |
| `reason` | STRING | no | | 'Automatic - 3 no-shows in 90 days' or the office's text. |
| `fromDate` | DATEONLY | no | | The day the suspension starts (the strike day). |
| `toDate` | DATEONLY | no | | Inclusive last day; booking resumes the day after. |
| `strikeChargeIds` | JSONB | yes | | The NoShowCharge ids that made up the strike count (an audit of why). |
| `status` | STRING(10) | no | 'active' | `active` / `lifted` / `expired` (the worker expires past rows nightly; a lifted row keeps its dates). |
| `liftedAt` / `liftedBy` / `liftReason` | DATE / UUID / STRING | yes | | |
| `createdBy` / `createdByDepartmentId` / `updatedBy` | UUID | yes | | Ownership stamps. |

#### Columns added in slice 4

- `FacilitySetting`: `lateCancellationAction` (STRING(10), default `charge`: `charge` raises the late-cancel charge and lets the cancel through; `refuse` refuses the cancel inside the notice window - the desk may still cancel with a waive and a reason), `noShowTransactionTypeId` (UUID, nullable: the `no-show` charge type priced; when NULL the engine takes the active no-show item scoped to the facility type, else the general one, else raises unpriced), `noShowChargeBasis` (STRING(12), default `booking`: `booking` / `slot` / `participant`), `noShowGraceMinutes` (INTEGER, default 15: a booked slot may be marked no-show once its start plus the grace has passed), `strikeCount` (INTEGER, default 3), `strikeWindowDays` (INTEGER, default 90), `strikeSuspensionDays` (INTEGER, default 30).
- `FacilityType`: `noShowChargeEnabled` (BOOLEAN, default true) and `noShowStrikeEnabled` (BOOLEAN, default false), both effective only while the Specification's master switch is ON.
- `Booking` keeps `isLateCancel` (slice 2b) and gains nothing; the booking's display status reads `no-show` when every live slot carries `no-show` (derived, as golf).
- Email templates `facility.noshow.charged` (the booker: the booking, the reason, the amount and whether it was posted to the account or awaits the desk) and `facility.suspension.started` (the member: the strikes, the dates, whom to contact); `facility.booking.cancelled` gains a `lateCharge` variable (the late-cancel amount when raised, empty otherwise).

#### No-show rules (binding; the office waives, never the engine)

1. **Late cancellation**: on a cancel inside the notice window with the master switch ON and the type's `noShowChargeEnabled`, action `charge` cancels the booking and raises a `late-cancel` charge (pending; never a strike); action `refuse` refuses the cancel naming the deadline, unless the desk cancels with `waiveCharge` and a reason, which raises the row `waived`. The cancel preview already shows the verdict; it now shows the quoted amount or the refusal.
2. **No-show mark**: from the station's Check-in view a `booked` slot whose start plus `noShowGraceMinutes` has passed without a check-in offers *No show*; marking it sets the slot `no-show`, and the FIRST no-show slot of a booking raises the booking's `no-show` charge (later no-show slots of the same booking update its quantity under the `slot` basis); a slot checked in late is never a no-show.
3. **End of day** on a slot type lists every still-`booked` slot past its end and, on confirm, marks them all (show expected results: the slots, the bookers, the charges that will be raised).
4. **Pricing**: the no-show transaction type's flat card in force on the booking date, taxed through the tax seam; quantity 1 per booking, the no-show slot count, or the roster size by the basis; no card in force raises the row unpriced (0.00, remarks 'no price in force') so the office prices it and presses *Re-price*.
5. **Posting**: AFTER the raising transaction commits (never inside it), each pending row with a member booker posts one AR invoice through the ONE AR invoice type opened to the Facility module (credit NOT enforced - a penalty is never refused by the limit, as golf); a charge-barred member, a missing ledger account or a visitor booker leaves the row pending with the reason in `remarks`; the listing's *Post* retries.
6. **Strike**: a `no-show` row raised while the type's `noShowStrikeEnabled` is ON counts; when the booker's counted rows with `bookingDate` inside the last `strikeWindowDays` reach `strikeCount` and no suspension is active, a suspension is created from the strike day for `strikeSuspensionDays`, club-wide, and the member is emailed; the counted rows are listed on the suspension.
7. **Suspended booking**: the booking channel refuses a booker (and a member participant) whose active suspension covers the booking date, naming the last day; the station's entry and issue are unaffected; the office lifts a suspension early with a reason.
8. **Waive**: the office waives a pending row with a reason; a waived `no-show` row keeps its strike unless the office also clears it (*Waive and clear the strike*); a posted row is reversed in AR by Finance (a credit note), not here.

#### Slice 4 screens and API

- `/facility/no-show-charges` - **No-show Charges**: the listing (status filter, date range, search by booking number or booker; each card the booking, the reason, the amount and tax, the status chip, the AR document or the pending reason) with *Post* on a pending row, *Waive* (reason, keep or clear the strike) and *Re-price*; the kebab holds the booking link.
- `/facility/suspensions` - **Booking Suspensions**: active and past suspensions (member, dates, reason, the strikes behind it) with *Lift* (reason) and *New suspension* (a manual one: member, dates, reason, optional facility type).
- Control Station's Check-in view gains the *No show* action per slot past the grace and the End of day sweep for slot types; Facility Bookings' cancel preview shows the late-cancel amount or the refusal and the desk's *Waive the charge* option; Facility Specification's *Cancellation and No-show* card gains the action, the transaction type picker, the basis, the grace and the three strike numbers; Facility Types gain the two switches.
- API: `GET /no-show-charges?status&from&to&q`, `POST /no-show-charges/:id/post`, `POST /no-show-charges/:id/waive` (reason, clearStrike), `POST /no-show-charges/:id/reprice`; `GET /suspensions?status`, `POST /suspensions` (manual), `POST /suspensions/:id/lift` (reason); `POST /station/no-shows` (slotIds) and the station's `today` picture carrying `noShowEligible` per slot; `POST /bookings/:id/cancel` gains `waiveCharge` + `waiveReason`, `GET /bookings/:id/cancel-preview` gains `charge` (the quote) and `refused`; `GET /settings/no-show-types` (the pickable no-show items). Menus the user adds: `/facility/no-show-charges`, `/facility/suspensions`.

### Slice 5 - Classes (FULL DETAIL, approved as revised 2026-10-26; 5a SMOKED on dev 2026-10-26; 5b BUILT 2026-10-26, dev smoke pending)

**Status:** approved as revised with Venue 2026-10-26; sub-slice 5a built 2026-10-26 (the Venue, Instructor, Class, ClassSchedule and ClassSession models; the pure scheduling rules in classScheduleRules.service.js (unit-tested) and the loaders in classSchedule.service.js; the venues, instructors, classes with schedules (preview, create, re-planning update, close, cancel) and class-sessions (week listing, one-off, move, cancel) controllers and routes; the Specification's three class columns; the grid's class cells with the claim and create refusals; the Venues, Instructors, Classes and Class Schedule screens and the Specification's Classes card); smoked on dev 2026-10-26 (Tropicana: venue COURT1 on BC1 stating "blocks the whole of BC1", venue STUDIO unlinked, instructor COACH1, class BADM_COACH per session on COURT1 with 6 seats, schedule November coaching Mon and Wed 18:00-19:00 from 27 Oct to 15 Nov previewed with 2 Nov marked CONFLICT against FB-00002 and saved with 4 sessions; the booking grid rendered BC1 18:00 on 28 Oct as a class cell and refused the claim with 409; on the timetable the 28 Oct session moved to 19:00, a one-off on STUDIO was added and cancelled with a reason, a one-off overlapping the instructor was refused, and shortening the schedule to 8 Nov re-planned it: 2 updated, 2 cancelled). Polish after the smoke: the session messages name the date as text and the add and cancel flashes use the device format.
Sub-slice 5b built 2026-10-26 (the ClassEnrolment and ClassAttendance models with the partial uniques, the bill's classEnrolmentId as the fourth source, the pure enrolment rules in classEnrolmentRules.service.js (unit-tested) and the engine in classEnrolment.service.js: standing, visitors, the duplicate check, the capacity under the session rows' lock, the fee bill with its one line, the roster, the attendance marks and Hold with its preview; the routes under /class-sessions/:id (roster, attendance, hold), /class-enrolments and /station/class-enrolments; the sessions listing and the station's today picture carry the seats taken, the day's class sessions and the master switch; the shared <app-class-roster> embedded by the Class Schedule drawer (channel desk) and the Control Station's Classes view (channel station, walk-ins), with the UNPAID bill chip deep-linking to the bill drawer, which names the class as the source), awaiting the dev smoke; 5c (waitlist, cancellations, emails) not built. 5b (enrolment, billing, attendance, the station view) and 5c (waitlist, cancellations, emails) not built.
Instructor-led classes (yoga, aqua aerobics, badminton coaching, swimming lessons): a club publishes a timetable, members enrol per session or per term, the seat is billed through the facility bill, the instructor or the desk marks attendance, and a full session keeps a waitlist.
Eight tables carry it (the venue, the instructor master, the class, its schedule header and generated sessions, the enrolment, the per-session attendance and the waitlist) plus three columns on the Specification and one on the bill.
A class is held at a **Venue** (your 2026-10-26 change): the place of its own, not a facility - two lanes of the pool, the shallow corner, a studio, a meeting room, or a whole court.
A venue may link to ONE facility unit, and that link decides the blocking: a venue on a slot-type unit blocks the whole unit's booking cells while a session runs (a court is whole), a venue on an entry-type unit blocks nothing (the session takes part of the pool and the door count stays the pool's own), and an unlinked venue blocks nothing and has no closures.
Decisions proposed here and open for your change: a class has ONE enrolment mode (`session` or `term`) and ONE fee item per audience (members, and optionally a dearer visitor item), the fee being per session or per term by the mode; the enrolment is billed at enrolment on a facility bill of its own (the same bill drawer and tenders as a booking), the seat is held while the bill is open and an unpaid seat is shown on the roster, not refused; a class no-show is an attendance status only (the fee is already billed) with no penalty and no strike; cancelling a seat outside the class notice voids an unsettled bill and leaves a settled one to Finance for a credit note, inside the notice the fee stands; a booking suspension does NOT bar class enrolment; schedule changes touch FUTURE sessions without enrolments only; the waitlist is first come first served with a timed offer the worker lapses; a venue without a facility link gets no closures of its own (an unavailable studio is handled by cancelling the session).

#### `facility.Venue` - where a class is held

Model `FacilityVenue`, table `facility."Venue"`, unique `(companyId, code)`, indexes `(companyId, isActive)`, `(facilityId)`.
The place of a class; several venues may share one facility unit ('Pool lanes 1-2' and 'Pool lanes 3-4' both on the Swimming Pool).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `code` | STRING(20) | no | | Short code, upper-cased, frozen once a session references the venue. |
| `name` | STRING | no | | 'Pool lanes 1-2', 'Studio A', 'Badminton Court 3'. |
| `description` | STRING | yes | | |
| `facilityId` | UUID | yes | | The facility unit the venue occupies; NULL = not a facility (a studio, a meeting room). A slot-type unit is blocked whole while a session runs; an entry-type unit is not blocked. |
| `capacity` | INTEGER | no | | Default seats (1 to 500); a class, a schedule or a session may lower it. |
| `location` | STRING | yes | | Where to find it ('Level 2, past the gym'). |
| `remarks` | STRING | yes | | |
| `isActive` | BOOLEAN | no | true | An inactive venue keeps past sessions and cannot be picked for new ones. |

#### `facility.Instructor` - the instructor master

Model `FacilityInstructor`, table `facility."Instructor"`, unique `(companyId, code)`, index `(companyId, isActive)`.
A person who leads sessions; no login of their own in this slice (an instructor portal would link `userId` later, as the Sales Agent module did).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `code` | STRING(20) | no | | Short code, upper-cased, frozen once a session references the instructor. |
| `name` | STRING | no | | |
| `mobile` | STRING(30) | yes | | |
| `email` | STRING | yes | | Receives the session cancellation and the daily roster emails when set. |
| `specialities` | STRING | yes | | Free text ('Yoga, Pilates'). |
| `photoUrl` | STRING(1000) | yes | | Uploaded like a Facility Type icon. |
| `remarks` | STRING | yes | | |
| `isActive` | BOOLEAN | no | true | An inactive instructor keeps past sessions and cannot be picked for new ones. |

#### `facility.Class` - the programme

Model `FacilityClass`, table `facility."Class"`, unique `(companyId, code)`, indexes `(companyId, isActive)`, `(companyId, venueId)`.
What the club offers; the timetable comes from its schedules.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `code` | STRING(30) | no | | Upper-cased, frozen once an enrolment exists. |
| `description` | STRING | no | | The display name ('Morning Yoga'). |
| `details` | TEXT | yes | | What the class is, what to bring; shown on the roster and in the enrolment email. |
| `venueId` | UUID | yes | | The default venue; NULL = chosen per schedule. |
| `instructorId` | UUID | yes | | The default instructor; NULL = chosen per schedule. |
| `capacity` | INTEGER | yes | | Default seats per session; NULL = the venue's capacity, else at most the venue's. A schedule or a session may lower it further. |
| `enrolmentMode` | STRING(10) | no | 'session' | `session` (one seat in one session) / `term` (one seat in every session of a schedule). |
| `feeTransactionTypeId` | UUID | yes | | A `class-fee` transaction type priced by its flat card: per session or per term by the mode. NULL = free. |
| `visitorFeeTransactionTypeId` | UUID | yes | | The item a visitor pays when it differs; NULL = the member item. |
| `visitorsAllowed` | BOOLEAN | no | false | Whether a non-member may enrol (with a visitor profile, as a booking's visitor booker). |
| `walkInAllowed` | BOOLEAN | no | true | Whether the station may enrol a patron into a session on the day (within capacity). |
| `cancellationNoticeHours` | INTEGER | yes | | Overrides the Specification's class notice; NULL = the Specification's. |
| `sortOrder` | INTEGER | no | 100 | |
| `isActive` | BOOLEAN | no | true | An inactive class takes no new schedules or enrolments; scheduled sessions run out. |

#### `facility.ClassSchedule` - the recurrence header

Model `FacilityClassSchedule`, table `facility."ClassSchedule"`, FK `classId` cascades, indexes `(companyId, dateFrom)`, `(classId)`.
The header that generates sessions (golf's slot-set / closure-plan pattern: header, preview, generated rows the user reviews and saves); in `term` mode the schedule is also the thing a patron enrols in.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `classId` | UUID | no | | |
| `name` | STRING | no | | 'Term 1 2027', 'Weekday mornings'. |
| `dateFrom` | DATEONLY | no | | |
| `dateTo` | DATEONLY | no | | Inclusive; at most 366 days after `dateFrom`. |
| `weekdays` | JSONB | no | | The ISO weekdays that run (1 = Monday .. 7 = Sunday), at least one. |
| `startTime` | TIME | no | | |
| `endTime` | TIME | no | | After `startTime`, same day. |
| `venueId` | UUID | yes | | Venue for this schedule's sessions; NULL = the class default (one of the two must be set at save). |
| `instructorId` | UUID | yes | | NULL = the class default (one of the two must be set at save). |
| `capacity` | INTEGER | yes | | NULL = the class default, else the venue's. |
| `skipClosures` | BOOLEAN | no | true | Generation skips a day the venue's linked facility (or its type) is closed; no effect on an unlinked venue. |
| `skipPublicHolidays` | BOOLEAN | no | true | Generation skips public holidays (calendar seam). |
| `termFeeNote` | STRING | yes | | Free text shown with a term enrolment ('10 sessions'). |
| `status` | STRING(10) | no | 'active' | `active` / `closed` (no new enrolments; sessions run out) / `cancelled` (every future session cancelled). |
| `remarks` | STRING | yes | | |

#### `facility.ClassSession` - one meeting of a class

Model `FacilityClassSession`, table `facility."ClassSession"`, FK `classId` cascades, FK `scheduleId` SET NULL (a one-off session has none), unique `(scheduleId, sessionDate)` on generated rows, indexes `(companyId, sessionDate)`, `(classId, sessionDate)`, `(venueId, sessionDate)`, `(instructorId, sessionDate)`.
Generated from a schedule or added as a one-off (a make-up session, a workshop).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `classId` | UUID | no | | |
| `scheduleId` | UUID | yes | | NULL on a one-off session. |
| `sessionDate` | DATEONLY | no | | |
| `startTime` / `endTime` | TIME | no | | Editable per session (a moved session). |
| `venueId` | UUID | no | | Resolved at generation (session > schedule > class); editable per session (a moved session). |
| `facilityId` | UUID | yes | | Snapshot of the venue's linked unit at generation, for the grid's class cells and the conflict checks; NULL on an unlinked venue. |
| `instructorId` | UUID | no | | Resolved at generation; editable per session (a substitute). |
| `capacity` | INTEGER | no | | Resolved at generation (session > schedule > class > venue); editable per session. |
| `status` | STRING(10) | no | 'scheduled' | `scheduled` / `held` / `cancelled`. |
| `heldAt` / `heldBy` | DATE / UUID | yes | | Set by *Hold session*. |
| `cancelledAt` / `cancelledBy` / `cancelReason` | DATE / UUID / STRING | yes | | |
| `remarks` | STRING | yes | | 'Bring a mat'. |

#### `facility.ClassEnrolment` - the seat contract

Model `FacilityClassEnrolment`, table `facility."ClassEnrolment"`, FK `classId` cascades, FKs `sessionId` / `scheduleId` RESTRICT, partial unique `(patronId, sessionId) WHERE status <> 'cancelled'` and `(patronId, scheduleId) WHERE status <> 'cancelled'`, indexes `(companyId, enrolledAt)`, `(patronId)`, `(billId)`.
One row per patron per thing enrolled in: a session (`session` mode) or a schedule (`term` mode); exactly one of `sessionId` / `scheduleId` is set.
The fee is billed on this row's bill; the attendance rows carry the per-session status.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `classId` | UUID | no | | |
| `sessionId` | UUID | yes | | `session` mode. |
| `scheduleId` | UUID | yes | | `term` mode. |
| `patronId` | UUID | no | | Member or visitor Patron (visitor only when the class allows). |
| `patronName` / `memberNo` | STRING / STRING(50) | no / yes | | Snapshot. |
| `channel` | STRING(10) | no | 'desk' | `desk` / `station` (walk-in) / `portal` (later). |
| `billId` | UUID | yes | | The facility bill carrying the fee line; NULL on a free class. |
| `feeAmount` | DECIMAL(21,2) | no | 0 | The fee billed (snapshot of the bill line total, 0 on a free class). |
| `status` | STRING(10) | no | 'enrolled' | `enrolled` / `completed` (every attendance row final) / `cancelled`. |
| `enrolledAt` | DATE | no | now | |
| `cancelledAt` / `cancelledBy` / `cancelReason` | DATE / UUID / STRING | yes | | |
| `isLateCancel` | BOOLEAN | no | false | Cancelled inside the class notice (the fee stood). |
| `remarks` | STRING | yes | | |

#### `facility.ClassAttendance` - one patron in one session

Model `FacilityClassAttendance`, table `facility."ClassAttendance"`, FK `enrolmentId` cascades, FK `sessionId` cascades, unique `(enrolmentId, sessionId)`, indexes `(sessionId, status)`, `(companyId, sessionDate)`.
Created with the enrolment: one row in `session` mode, one per remaining session of the schedule in `term` mode (a later one-off session added to a schedule creates rows for its term enrolments).
Capacity counts the live rows of a session.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `enrolmentId` | UUID | no | | |
| `sessionId` | UUID | no | | |
| `sessionDate` | DATEONLY | no | | Snapshot for the per-day indexes and the station. |
| `patronId` | UUID | no | | Denormalised for the roster. |
| `status` | STRING(10) | no | 'enrolled' | `enrolled` / `attended` / `no-show` / `excused` / `cancelled`. |
| `markedAt` / `markedBy` | DATE / UUID | yes | | Who marked it (instructor at the station, or the desk). |
| `remarks` | STRING | yes | | |

#### `facility.ClassWaitlist` - the queue for a full session or term

Model `FacilityClassWaitlist`, table `facility."ClassWaitlist"`, FK `classId` cascades, FKs `sessionId` / `scheduleId` cascade, partial unique `(patronId, sessionId) WHERE status IN ('waiting','offered')` and the same on `scheduleId`, indexes `(sessionId, status, createdAt)`, `(scheduleId, status, createdAt)`, `(companyId, status, offerExpiresAt)`.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `companyId` | UUID | no | | |
| `classId` | UUID | no | | |
| `sessionId` / `scheduleId` | UUID | yes | | Exactly one set, as the enrolment. |
| `patronId` | UUID | no | | |
| `patronName` / `memberNo` | STRING / STRING(50) | no / yes | | Snapshot. |
| `status` | STRING(10) | no | 'waiting' | `waiting` / `offered` / `enrolled` / `withdrawn` / `lapsed`. |
| `offeredAt` | DATE | yes | | |
| `offerExpiresAt` | DATE | yes | | `offeredAt` + the Specification's offer hours; the worker lapses it and offers the next. |
| `enrolmentId` | UUID | yes | | The enrolment created on confirm. |
| `remarks` | STRING | yes | | |

#### Columns added in slice 5

- `FacilitySetting`: `classesEnabled` (BOOLEAN, default false: the master switch for the class screens, the station's Classes view and the grid's class cells), `classCancellationNoticeHours` (INTEGER, default 24: a seat cancelled closer than this to the session start is a late cancellation and keeps its fee; 0 = no notice rule), `classWaitlistOfferHours` (INTEGER, default 24: how long an offered seat is held for the first in the queue).
- `Bill`: `classEnrolmentId` (UUID, nullable, index) - the fourth source a bill may be keyed to (booking | registration | issue | enrolment); the bill drawer, `sourceOf` and the deep links extend to it.
- `TransactionType`: no new column; the existing `class-fee` charge type (flat card) is the fee item, `per-booking` its fee basis (one line per enrolment).
- `Facility`: no new column; the venue links to the unit, never the other way, so a unit knows nothing of classes and the grid reads the sessions by `ClassSession.facilityId`.
- Email templates `facility.class.enrolled` (the patron: the class, the venue, the session or term, the fee and whether it is paid or awaits the desk), `facility.class.session.cancelled` (every enrolled patron and the instructor: the session, the reason, what happens to the fee) and `facility.class.waitlist.offered` (the patron: the seat offered and until when).

#### Class rules (binding)

1. **Master switch**: with `classesEnabled` OFF the four class screens show their notice and no actions, the station hides its Classes view and the grid shows no class cells; already scheduled sessions stay as data.
2. **Scheduling**: a schedule generates one `scheduled` session per matching weekday between `dateFrom` and `dateTo` at its times with the resolved venue, instructor and capacity; the preview lists every date and marks SKIPPED the days the venue's linked facility or its type is closed (when `skipClosures`) and the public holidays (when `skipPublicHolidays`), and marks CONFLICT the dates where the venue, the venue's slot-type unit or the instructor is already taken in the time range (rule 4 says what counts); conflicts are not generated and are listed with the booking or session in the way; the user saves the reviewed list (show expected results).
3. **Changing a schedule**: edited times, venue, instructor or capacity apply to the FUTURE sessions that have no live attendance rows; future sessions with enrolments are listed and left as they are, to be moved or cancelled one by one; a shortened `dateTo` cancels the future sessions beyond it under rule 8; an extended `dateTo` generates the new dates through the same preview.
4. **Blocking and conflicts by venue**: a `scheduled` session whose venue links to a slot-type unit renders the overlapping cells of that whole unit as `class` on the booking grid (named with the class and the venue) and the booking channel refuses a claim that overlaps it; cancelling the session frees the cells; two sessions on venues of the same slot-type unit conflict in overlapping times (the court is whole), and so does a session over a live booking of that unit; a venue linked to an entry-type unit blocks nothing, its sessions do not count toward the entry capacity, and only two sessions on the SAME venue conflict; an unlinked venue blocks nothing and only its own sessions conflict; the same instructor on two overlapping sessions always conflicts.
5. **Enrolment**: the desk enrols a member by number (the same standing check as a booking: a barred standing refuses, a warning standing warns; a booking suspension does not apply) or a visitor profile when the class allows visitors; a `session` class enrols into one session, a `term` class into a schedule and materialises one attendance row per remaining session; capacity counts the live attendance rows of each session and a full session (or any full session of a term) refuses the enrolment and offers the waitlist; one live enrolment per patron per session or term.
6. **Billing**: an enrolment with a fee opens a facility bill for the patron with ONE line, the member or the visitor item at the flat price in force on the enrolment date (per session or per term by the mode), taxed through the tax seam; no price in force refuses the enrolment naming the item (as a booking's fee); the bill settles through the bill drawer with the usual tenders (the `member` class posts to AR with credit enforced); the seat is `enrolled` while the bill is open and the roster shows UNPAID until it settles; a free class opens no bill.
7. **Attendance**: from the session roster (the Class Schedule screen or the station's Classes view) the instructor or the desk marks each row `attended` / `no-show` / `excused`; *Hold session* lists the unmarked rows that will become `no-show` and, on confirm, marks them and sets the session `held`; a held session's rows are final; a class no-show is a status only, with no charge and no strike.
8. **Session cancellation by the club**: a `scheduled` session is cancelled with a reason; every enrolled patron and the instructor are emailed; `session` enrolments on it are cancelled with their unsettled bills voided and their settled bills listed for Finance (a credit note, not here); `term` enrolments lose the session (their attendance rows are cancelled, the term fee stands); a make-up may be added as a one-off session of the schedule, which materialises the term rows; a closure day generated over a scheduled session of a linked venue warns in the closure preview and cancels the session on confirm; an unlinked venue that is unavailable is handled by cancelling the session.
9. **Cancellation by the patron**: outside the class notice (the class's override, else the Specification's) a `session` enrolment is cancelled and its unsettled bill voided (a settled bill is listed for Finance), inside the notice it is cancelled as late and the fee stands; a `term` enrolment withdraws from its remaining sessions and the fee stands either way (no proration); the preview states which applies (show expected results); the freed seat triggers the waitlist.
10. **Waitlist**: joined when full, first come first served per session or term; when a seat frees the first `waiting` row becomes `offered`, is emailed and holds the seat until `offerExpiresAt`; the desk confirms it into an enrolment (billed as rule 6) or it lapses and the next is offered (worker tick, every 15 minutes with the auto sign-out); a patron may withdraw; an enrolment made directly while a seat is offered is refused (the seat is held).
11. **Instructors and venues**: a session has one instructor and one venue; an instructor cannot be on two sessions that overlap (refused at generation as a conflict and at a session edit); an inactive instructor or venue keeps past sessions; the Class Schedule filters by instructor and by venue to give each their timetable; a venue's facility link and a class's or schedule's venue are frozen once a session exists, and a moved session picks its own venue.

#### Slice 5 screens and API

- `/facility/venues` - **Venues**: the master listing (card: code, name, the linked unit or 'not a facility', capacity, active chip; Edit visible, Enable / Disable in the kebab) with a create / edit drawer (the unit picker is a combobox over the active facilities of every type, with the blocking consequence stated under it: 'blocks the whole court while a session runs' / 'takes part of the pool, nothing blocked').
- `/facility/instructors` - **Instructors**: the master listing (card: code, name, specialities, active chip; Edit visible, Enable / Disable in the kebab) with a create / edit drawer.
- `/facility/classes` - **Classes**: the master listing (card: code, description, venue, instructor, capacity, mode, fee items, active chip; Edit visible; *Schedules*, Enable / Disable in the kebab) with a create / edit drawer; *Schedules* opens the class's schedules in the same drawer (list, *New schedule* with the preview of generated sessions marked skipped or conflict, edit, close, cancel).
- `/facility/class-schedule` - **Class Schedule**: the timetable, a week strip of sessions per day (filters: class, instructor, venue; status chips scheduled / held / cancelled with seats taken of capacity); a session opens its roster drawer: enrol (member number or visitor), the attendance marks, UNPAID flags with the bill deep link, the waitlist with *Offer* / *Confirm* / *Withdraw*, *Hold session*, *Cancel session* (reason), edit times / venue / instructor / capacity, *Add one-off session*.
- Control Station gains a **Classes** view (today's sessions with the venue and seats taken, the roster with attendance marks and *Hold*, walk-in enrolment when the class allows it); Facility Bookings' grid shows `class` cells; Facility Specification gains a *Classes* card (master switch, class notice hours, waitlist offer hours); the bill drawer opens from an enrolment (`?billId=`).
- API: `/venues` (GET, POST, PUT, PATCH active); `/instructors` (GET, POST, PUT, PATCH active); `/classes` (GET, POST, PUT, PATCH active), `/classes/:id/schedules` (GET, POST preview, POST, PUT, POST close, POST cancel); `/class-sessions?from&to&classId&instructorId&venueId` (GET), `POST /class-sessions` (one-off), `PATCH /class-sessions/:id`, `POST /class-sessions/:id/cancel`, `POST /class-sessions/:id/hold` (with a preview of the rows it marks), `GET /class-sessions/:id/roster`, `PUT /class-sessions/:id/attendance`; `POST /class-enrolments` (classId, sessionId or scheduleId, memberNo or visitor profile), `GET /class-enrolments/:id/cancel-preview`, `POST /class-enrolments/:id/cancel`; `POST /class-waitlist`, `POST /class-waitlist/:id/offer`, `POST /class-waitlist/:id/confirm`, `POST /class-waitlist/:id/withdraw`; `POST /bills` accepts `classEnrolmentId`; the station's `today` picture gains `sessions` per type and `POST /station/class-enrolments` for the walk-in; the booking availability grid gains the `class` cell state. Menus the user adds: `/facility/venues`, `/facility/instructors`, `/facility/classes`, `/facility/class-schedule`.
- Build order inside the slice: 5a venues + instructors + classes + schedules with the generated sessions and the grid blocking; 5b enrolment, billing, attendance and the station view; 5c waitlist, cancellations and the emails.

## Public API (gateway seam: `/api/facility`)

- `GET /health` returns `{ service: 'facility', status: 'ok' }`; the slice-1 routes are listed under *Slice 1 screens and API*; anything else answers `501` behind `verifyToken` + `requireModule('FACILITY')` so a caller can tell "wrong URL" from "planned but not implemented".
- Each later slice adds its routes beside its tables.
- Every route that reads a request part mounts `validate()` with a `*.schemas.js` file beside its controller, and every screen's sub-router mounts `requireMenuAction('<screen route>')` on top of the module gate.

## Depends on

- Identity (JWT verify) and Control Plane (`requireModule('FACILITY')` - the frozen `Module.code`, never the display name; roles and menu grants).
- **Membership** - member standing, charge target and (slice 2) the monthly guest allowance and guest-visit ledger through `platform/membershipGateway.js`, never shared tables.
- **Calendar** - weekday / weekend classification and the club timezone through `platform/calendarGateway.js` (public holidays count as weekend).
- **Tax** - rate resolution through `platform/taxGateway.js` (slice 2).
- **AR** - charge-to-account and no-show postings through `platform/arGateway.js` (`postCharge` already accepts the `facility` source module).
- **Numbering** - the `facility-*` series through `platform/numberingGateway.js` (slice 2 onward).
- **Workflow** - approval-required facility types through `platform/workflowGateway.js` (slice 2, purpose `facility-booking`).
- Notification (outbox): templated booking confirmation / cancellation / no-show emails like golf's (slice 2 onward).

## Consumed by

- Reporting / analytics; Membership (the member's guest tally reads the ledger Membership owns, facility only posts to it); Golf shares nothing (separate resources).

## Auth & entitlements

- Valid JWT + active company subscribed to the module with code `FACILITY`; per-screen `requireMenuAction`; `canModifyRecord` on update paths; the three ownership stamps on every table.

## Migration status

- [x] Slice 1 models · [x] Slice 1 routes / controllers / screens (2026-10-25, smoked on dev) · [x] Slice 2a masters + Membership additions (2026-10-25, smoked on dev) · [x] Slice 2b booking (2026-10-25, smoked on dev) · [x] Slice 2c billing (2026-10-25, smoked on dev 2026-10-26) · [x] Slice 3 Control Station (2026-10-26, smoked on dev) · [x] Slice 4 No show (2026-10-26, smoked on dev) · [x] Slice 5a venues, instructors, classes, schedules, grid blocking (2026-10-26, smoked on dev) · [x] Slice 5b enrolment, billing, attendance, Hold, station view (2026-10-26, dev smoke pending) · [ ] Slice 5c waitlist · [ ] Events · [ ] Own DB · [ ] Own deploy
