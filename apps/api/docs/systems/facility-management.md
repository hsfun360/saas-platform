# Facility Management

> Status: **SLICE 1 BUILT 2026-10-25** (structures approved 2026-10-25; models, routes and the four screens are in the tree, awaiting the dev smoke). Gateway seam `/api/facility` is live for slice 1.
> Tier: **Product (core system)**.
> Slice 1 (Specification, Facility Type, Facility) is specified in full below; slices 2-5 are outlined and get their own structures when their turn comes.

## Purpose

Manage the club's bookable and walk-in facilities: courts booked by time slot, the gym and pool entered on registration, lockers and towels issued at a control station, instructor-led classes, with the booking controls (windows, per-type slot limits, guest policy, cancellation notice, no-show penalties) a members' club needs.

## Decisions taken (2026-10-24, kick-off)

- **Vocabulary.** The person identity is `facility.Patron` (thin row, member or visitor) + `facility.OtherPatron` (the visitor profile), mirroring `golf.Golfer` / `golf.OtherGolfer`.
  Screens are *Facility Specification*, *Facility Types*, *Facilities*, *Facility Bookings*, *Control Station*, *Classes*.
- **SUPERSEDED 2026-11-11 for the third mode (lockers and towels are Utility Items with their own master, see Slice 6; a Facility Type is `slot` or `entry`).** **Three usage modes on the Facility Type, no more:** `slot` (courts: booked by fixed time slot from a slot set defined on the type), `entry` (gym, pool: register on arrival, optional capacity), `issue` (lockers: numbered units issued and returned; towels: a counted consumable).
  Hourly hall hire is a `slot` type with 60-minute slots and a high consecutive cap; there is no duration mode and no per-game mode.
- **Billing copies golf's shape into the facility schema** (`Bill` / `BillItem` / `BillPayment` / `TransactionType` / `PaymentType`, slice 2).
  Two tender catalogs are accepted; the shared billing service is extracted when POS becomes the third consumer.
  The rate-card axis is player type x day type x session band (peak / off-peak); per-slot price only in slice 2, day and half-day packages later as package transaction types.
- **Visitor profiles stay per module for now.** A non-member exists once in golf and once in facility; a platform visitor master may come later with a re-point.
- **Guest allowance.** `MembershipType.guestQuota` STAYS the golf per-booking cap (live since 2026-09-28).
  Membership Type gains a NEW monthly club-wide guest allowance, and Membership OWNS the guest-usage ledger (`membership.GuestVisit`) that every producer writes through the membership seam; facility is the first producer; golf joined on 2026-11-14 (see golf-management.md, MONTHLY GUEST ALLOWANCE).
  Golf also split Guest (always a member's guest) from Visitor (no host) on 2026-11-13; facility's participant types still carry the two under one "visitor guest" class - a facility-session topic, not changed here.
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
| `usageMode` | STRING(10) | no | | `slot` / `entry` (facility.constants USAGE_MODES; the third mode `issue` was retired 2026-11-11 - lockers and towels are Utility Items, see Slice 6). Frozen once a facility exists under the type. |
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

**Status:** 2a (Patron / OtherPatron models, Participant Types, Transaction Types with rate cards and cells, Payment Types, the facility numbering series, guest exception rules and membership-type overrides on the Specification, the default-fee pickers and approval switch on Facility Types, the Membership monthly allowance and GuestVisit ledger with its gateway) is built and smoked on dev (2026-10-25); 2b (Booking / BookingSlot / BookingParticipant / SlotLock, the availability engine, the nine rules, the Facility Bookings screen) is built and SMOKED on dev (2026-10-25: Tropicana BADMINTON, Monday 2 Nov 2026 grid, two-slot claim on BC1 with the consecutive rule refusing a gap, FB-00001 booked by MEM26-000001 with a visitor guest recorded on the Membership ledger, roster edited to two guests (ledger 2), cancelled outside the notice with both visits voided and the cells freed, FB-00002 rebooked and a third slot refused by the weekday limit of 2 on both the screen and the server; FB-00002 stays as test residue); 2c (Bill / BillItem / BillPayment, the pricing engine on the rate cards, the bill endpoints and the bill and settle views in the bookings drawer) is built and SMOKED on dev (2026-10-26: FBL- bill series added, FBL-00001 opened on FB-00002 with the two per-slot BADM lines at 20.00, GUESTFEE refused for its missing price card, quantity amended, a line removed, settled with CASH 40.00; the member and debtor tenders were exercised on dev on 2026-10-27 once an AR invoice type was opened to Facility - see "Charge to account on dev" under slice 4).

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
| `sourceModule` | STRING(20) | no | | `membership` (a front-desk Guest Registration, 2026-11-10) / `facility` / `golf`. |
| `sourceRef` | UUID | no | | The producer's line (facility: the BookingParticipant id; membership: the GuestRegistration id). |
| `guestId` | UUID | yes | | The `membership.Guest`, when the line knows the person (2026-11-10): a known guest counts once per host per day across the modules. |
| `guestName` | STRING | yes | | Display. |
| `guestCount` | INTEGER | no | 1 | |
| `status` | STRING(20) | no | 'confirmed' | `confirmed` / `voided`. |
| `voidedAt` | DATE | yes | | |

Gateway (`platform/membershipGateway.js`): `getGuestAllowanceStanding(companyId, memberId, date)` -> `{ allowance, used, remaining }` for the calendar month of `date` (club-local) counting `confirmed` visits; `recordGuestVisit(companyId, { memberId, visitDate, sourceModule, sourceRef, guestName, guestCount, stamps }, { transaction })`; `voidGuestVisit(companyId, sourceModule, sourceRef, { transaction })`.
Facility records a visit per guest participant when the booking is confirmed (inside the booking transaction, so an exhausted allowance refuses the booking), voids it when the booking or that participant is cancelled, and leaves it when the guest fails to show.
Golf is wired to the same ledger in a later golf slice; nothing in golf changes now.
Since 2026-11-10 Membership is a producer itself (Guest Registration) and the ledger counts by the once-per-day rule: `recordGuestVisit` accepts an optional `guestId`, a line that carries it counts once per host per day however many modules write one, and a line without it (every facility line today, which holds only a name) counts its own `guestCount` as before.
Facility passes nothing new yet; giving its guest lines an identity, and with it the day pass, is a later slice (see "Built: Guest Registration and the day pass" in membership-management.md).
Registration Counter (2026-11-14, built in the Membership session): the same pass is now also issued to a visiting affiliated or reciprocal member and to the guests they bring, so `findGuestPass` / `getGuestPass` may answer a pass whose `patronGroup` is `affiliate` or `reciprocal`.
On such a pass `host` is NULL and `club`, `visit` and `accompanying` say who the holder is.
`stationRules.passVerdict` refuses it with a clear message for now ("the station does not serve these passes yet"); serving it (the item's own answer for these holders, entering a facility on the pass, the entry fee, charge to home club, completion held while an item is out or a facility bill is open) is the station part still to be built in the Facility session.
The station message "cancel it under Guest Registrations" still names the old screen; the screen is the Registration Counter now.

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
Not exercised on dev: the automatic strike suspension (one counted no-show against a strike count of 2).
Charge to account on dev (2026-10-27, Tropicana): the AR invoice transaction type FACILITY was opened to the Facility module on AR - Transaction Type (the screen already offered Facility; the gateway, the bill settle and the no-show posting needed no change), the facility payment types MEMBER (class member) and DEBTOR (class debtor) were added, and the pending no-show charge on FB-00004 posted as INV-000009 through POST /no-show-charges/:id/post.
The member tender on class bill FBL-00008 was first refused with "Credit limit exceeded for this debtor" because the membership carried no credit limit (the AR pool stood at 0); setting MEM26-000001's credit limit to 1000 on the membership synced the pool through the DebtorCreditLimitSyncRequested outbox event within seconds, and the retry settled the bill with INV-000010 on Ahmad's membership account.
The debtor tender on FBL-00007 charged TA-0001 Golf Holidays Travel Sdn Bhd with INV-000011.
All three documents carry sourceModule facility and stand outstanding on the debtor accounts.
Polish after the run: on a phone the Other Debtor picker of a debtor payment line takes its own row under the amount instead of sharing a half-width cell.
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

### Slice 5 - Classes (FULL DETAIL, approved as revised 2026-10-26; 5a, 5b and 5c SMOKED on dev 2026-10-26)

**Status:** approved as revised with Venue 2026-10-26; sub-slice 5a built 2026-10-26 (the Venue, Instructor, Class, ClassSchedule and ClassSession models; the pure scheduling rules in classScheduleRules.service.js (unit-tested) and the loaders in classSchedule.service.js; the venues, instructors, classes with schedules (preview, create, re-planning update, close, cancel) and class-sessions (week listing, one-off, move, cancel) controllers and routes; the Specification's three class columns; the grid's class cells with the claim and create refusals; the Venues, Instructors, Classes and Class Schedule screens and the Specification's Classes card); smoked on dev 2026-10-26 (Tropicana: venue COURT1 on BC1 stating "blocks the whole of BC1", venue STUDIO unlinked, instructor COACH1, class BADM_COACH per session on COURT1 with 6 seats, schedule November coaching Mon and Wed 18:00-19:00 from 27 Oct to 15 Nov previewed with 2 Nov marked CONFLICT against FB-00002 and saved with 4 sessions; the booking grid rendered BC1 18:00 on 28 Oct as a class cell and refused the claim with 409; on the timetable the 28 Oct session moved to 19:00, a one-off on STUDIO was added and cancelled with a reason, a one-off overlapping the instructor was refused, and shortening the schedule to 8 Nov re-planned it: 2 updated, 2 cancelled). Polish after the smoke: the session messages name the date as text and the add and cancel flashes use the device format.
Sub-slice 5b built 2026-10-26 (the ClassEnrolment and ClassAttendance models with the partial uniques, the bill's classEnrolmentId as the fourth source, the pure enrolment rules in classEnrolmentRules.service.js (unit-tested) and the engine in classEnrolment.service.js: standing, visitors, the duplicate check, the capacity under the session rows' lock, the fee bill with its one line, the roster, the attendance marks and Hold with its preview; the routes under /class-sessions/:id (roster, attendance, hold), /class-enrolments and /station/class-enrolments; the sessions listing and the station's today picture carry the seats taken, the day's class sessions and the master switch; the shared <app-class-roster> embedded by the Class Schedule drawer (channel desk) and the Control Station's Classes view (channel station, walk-ins), with the UNPAID bill chip deep-linking to the bill drawer, which names the class as the source); smoked on dev 2026-10-26 (Tropicana: CLASSFEE class-fee item with a 30.00 flat card, the Classes switch on, BADM_COACH billing CLASSFEE; the first enrolment hit a NOT NULL on facility.Bill.bookingId that the alter-sync had never relaxed on dev - fixed by a boot DDL outside the fingerprint gate; then Ahmad enrolled in the 28 Oct session from the roster drawer with bill FBL-00003 30.00 open, a second enrolment refused as a duplicate, the UNPAID chip opened the bill drawer named "class BADM_COACH" and it settled by cash; on a one-off session the same evening the station's CLASSES view took a walk-in visitor with bill FBL-00005, Ahmad was marked attended and Hold previewed the visitor as the one unmarked seat, marked it no-show, held the session and completed both enrolments).
Polish after the smoke: the bill drawer header shows the session's date for a class bill, and a booking whose every live slot is a no-show reads No show on the bookings screen (slice 4 rule the listing had missed).
Sub-slice 5c built 2026-10-26 (the ClassWaitlist model with its partial uniques and cascades; the pure notice and queue rules in classWaitlistRules.service.js (unit-tested: the class override over the Specification's notice, late inside the notice or after the start, void an open bill in time / Finance for a settled one / the fee stands when late, offered rows hold seats, first come first served, offers lapse at expiry); the lifecycle engine in classLifecycle.service.js: the patron's cancel preview and cancel (a session seat in time voids its open bill or lists a settled one for Finance, late keeps the fee and flags isLateCancel, a term withdrawal cancels the remaining attendance rows and keeps the fee), the club's session cancel cascade shared by the session cancel, the schedule re-plan and cancel, and the closure days save (every live attendance row cancelled, session-mode enrolments cancelled with open bills voided and settled ones counted for Finance, term seats just lose the session, the queue withdrawn), the waitlist (join only while no seat is free, with the enrolment and queue duplicate refusals; a freed seat offers the first waiting for the Specification's offer hours and emails them; the desk may Offer a named entry, Confirm an offered or waiting entry into an enrolment, or Withdraw it; the worker lapses expired offers every 15 minutes and offers the next); the enrolment's capacity check counts offered seats as taken (except the offer being confirmed); the closure generate-days preview lists the scheduled class sessions on the plan's unit(s) that the days would cover and the save cancels them; the three emails in classEmails.service.js queued after commit through the notification seam to the member's standing address or the visitor's profile (facility.class.enrolled with the fee and bill state, facility.class.session.cancelled to every seat with its fee note and to the instructor, facility.class.waitlist.offered with the hold expiry); the routes under /class-lifecycle (enrolments/:id/cancel-preview, enrolments/:id/cancel, waitlist, waitlist/:id/offer|confirm|withdraw) behind the Class Schedule or Control Station grant; the roster response carries the queue and the held seats; the shared <app-class-roster> gains the per-seat cancel with its preview confirm naming the bill outcome, Join waitlist through the enrol form when full, and the waitlist list with Offer / Confirm / Withdraw; the session cancel view names what the cascade does; the closure days editor warns with the sessions the save cancels).
Smoked on dev 2026-10-26 (Tropicana, deploy fa171d9: the 28 Oct BADM_COACH session's capacity cut to 2 with Ahmad seated; a visitor "Wait Visitor A" enrolled from the roster drawer with bill FBL-00006 open and the session read Full with Join waitlist; "Queue Visitor B" joined at position 1; a direct enrolment on the full session was refused with 409; a second join under the same unkeyed visitor name was accepted as a new person (no identity to match on, the same as enrol) and later withdrawn through the confirm card; Wait Visitor A's seat was cancelled from the roster with the preview naming the 24-hour notice and the bill outcome, FBL-00006 was voided and the seat was offered to Queue Visitor B until the next evening, the roster showing 1 of 2 taken and 1 held, a direct enrolment refused with "1 seat held for the waitlist", and Confirm enrolled B with bill FBL-00007 open; a one-off on 27 Oct 10:00 had Ahmad's seat cancelled through the API inside the notice - late, the fee stands, FBL-00008 still open; a one-off on 27 Oct 11:00 with Ahmad (FBL-00009 open) and "Cascade Visitor" (FBL-00010 settled by cash) was cancelled from the drawer's cancel view, which named the two seats, and the flash read "2 seats released, 1 open bill voided, 1 settled bill for Finance to refund"; the worker log showed the three facility.class.enrolled emails and the three facility.class.session.cancelled emails (Ahmad, the visitor, the instructor); a closure plan on BC1 for 30 Oct previewed the warning "Saving cancels 1 scheduled class session" naming the COURT1 one-off and the save cancelled it with the reason "Facility closed - 5c smoke closure"; the plan was deleted afterwards). Not exercised on dev: the worker's offer lapse (the offer hours are 24), the term withdrawal (BADM_COACH enrols per session), and the schedule re-plan cascade. Residue kept: the 28 Oct session at capacity 2 with Ahmad and Queue Visitor B (FBL-00007 open), the cancelled 27 Oct and 30 Oct one-offs. Polish after the smoke: the cancel-seat confirm starts its bill sentence with a capital and its button reads "Cancel and void bill".
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
- API: `/venues` (GET, POST, PUT, PATCH active); `/instructors` (GET, POST, PUT, PATCH active); `/classes` (GET, POST, PUT, PATCH active), `/classes/:id/schedules` (GET, POST preview, POST, PUT, POST close, POST cancel); `/class-sessions?from&to&classId&instructorId&venueId` (GET), `POST /class-sessions` (one-off), `PATCH /class-sessions/:id`, `POST /class-sessions/:id/cancel`, `POST /class-sessions/:id/hold` (with a preview of the rows it marks), `GET /class-sessions/:id/roster`, `PUT /class-sessions/:id/attendance`; `POST /class-enrolments` (classId, sessionId or scheduleId, memberNo or visitor profile); under `/class-lifecycle` (the Class Schedule or Control Station grant, built 5c): `GET /enrolments/:id/cancel-preview`, `POST /enrolments/:id/cancel`, `POST /waitlist` (the enrol body), `POST /waitlist/:id/offer`, `POST /waitlist/:id/confirm`, `POST /waitlist/:id/withdraw`; the closure `generate-days` preview returns `classSessions` and `PUT days` cancels them; `POST /bills` accepts `classEnrolmentId`; the station's `today` picture gains `sessions` per type and `POST /station/class-enrolments` for the walk-in; the booking availability grid gains the `class` cell state. Menus the user adds: `/facility/venues`, `/facility/instructors`, `/facility/classes`, `/facility/class-schedule`.
- Build order inside the slice: 5a venues + instructors + classes + schedules with the generated sessions and the grid blocking; 5b enrolment, billing, attendance and the station view; 5c waitlist, cancellations and the emails.

### Slice 6 - Utility Items and Station Arrival (approved as revised 2026-11-11; 6a BUILT 2026-11-11 and smoked on dev 2026-11-12; "Scan and serve" approved 2026-11-12 and its step 6b BUILT and smoked on dev 2026-11-12; 6c BUILT and smoked on dev 2026-11-12; 6d BUILT 2026-11-12 and smoked on dev 2026-11-12 and 13)

**Status:** drafted 2026-11-11, revised the same day with two changes from the user, and approved as revised.
Sub-slice 6a built 2026-11-11: the `UtilityItem` and `UtilityUnit` models; the pure rules in utilityRules.service.js (unit-tested: the behaviour of an item from its two switches, their normalisation, the codes Generate units proposes); the master's controller, schemas and routes under /api/facility/utility-items (items, units, generate with its preview, the icon upload); `IssueRecord` re-pointed (`utilityItemId`, `utilityUnitId`, the `used` status); the station engine's issue, return, unit clear and day picture on the new tables (the picture returns `utilityItems` beside `types`; a use-only item closes as `used` and its limit counts the day's uses); the issue usage mode and its columns retired from the facility types and the facilities; the move of the existing data (see "Moving what exists"); the Utility Items screen at /facility/utility-items; the station's strip and view reading the utility items; Facility Types and Facilities without the issue mode.
Built as drafted with these notes: the move runs at BOOT before the schema sync rather than as a script someone must remember (the script stays as a manual runner); the holder columns of `IssueRecord` arrive with 6c, so in 6a every item is still issued to a member; `guestsAllowed` and `requiresEntry` exist on the table but are neither shown on the screen nor enforced until 6c; the item icon can be uploaded through the API but the screen and the station strip do not use it yet.
Smoked on dev 2026-11-12 (Tropicana): the boot step moved the LOCKER type and its two units across (confirmed on the Utility Items screen, the boot log itself was not read); Generate units previewed a range with the existing numbers struck out and added the two fresh ones; a counted TOWEL and a use-only SHOWER were created; at the station a locker was issued, refused past the limit per person, returned damaged (parked) and cleared, two towels were issued and returned, a shower use was recorded and the second of the day refused; a locker with an issue fee opened bill FBL-00012, settled in cash.
Polish from that smoke (2026-11-12): the day picture carries `fee` per utility item (`{ code, description, unitAmount }` before tax, null amount = no price in force) and the issue form states what it will bill or that the item is free; a use keys no quantity; the limit refusal of a use-only item counts the day's uses; the counter row keeps its button at content width and a counted item with `stockQuantity` shows its bar; the bill drawer names the item and its unit ("LOCKER L001").
Not checked at phone width (the test browser window could not be resized).
6b, 6c and 6d not built.
Those three steps were revised and approved on 2026-11-12 ("Scan and serve - the station starts from the person", at the end of this slice): the station starts from a scanned pass or a member number and serves the person in one panel, a tap per item.
Its first step, 6b, is built and smoked on dev (2026-11-12); its second, 6c, is built and smoked on dev (2026-11-12); its third and last, 6d, is built and smoked on dev (the member path 2026-11-12, the guest path 2026-11-13).
The user's changes: (1) a towel or a locker must not be called a facility - they become **Utility Items** with a master file of their own; (2) a guest holding a pass (registered upfront) claims utility items at the station on their own, while a guest who was not registered must be at the station together with the member.

What is wrong today.
Lockers and towels are set up as Facility Types of usage mode "Issue and return", with Facility rows as the locker units, so they sit in the same lists as courts, the gym and the pool.
The station serves ONE member per action: an issue takes a member number only, so a guest's towel and locker land under the member's name.
The guest's day pass (Membership's Guest Registration, 2026-11-10) is not read at the station at all, and the door's guest line carries only a name, so a guest registered upfront is counted twice on the host's monthly allowance.

What this slice does.
It moves the things handed out at the station into their own master (two new tables), names the person holding each one, reads or issues the guest's pass at the door so a known guest counts once, and lets the desk handle a whole party in one action.

#### Vocabulary

- **Utility Item** - a kind of thing the station hands out or lets a person use: LOCKER, TOWEL, SHOWER. The user's term, adopted as proposed.
  "Amenity" was considered and not chosen: clubs also call the pool and the gym amenities, which brings back the very confusion this change removes.
- **Utility Unit** - one numbered piece of a utility item that is tracked one by one: locker L014.
- **Issue** and **Return** stay as the desk's actions; the patron "claims" an item.
- A **Facility** from here on is only a place a person books or enters: a court, a hall, the gym, the pool.

#### `facility.UtilityItem` - the master of what the station hands out (NEW TABLE)

Model `FacilityUtilityItem`, table `facility."UtilityItem"`, unique `(companyId, code)`.
Two switches describe how an item behaves, which covers the three examples and anything else a club adds:

| Example | `trackUnits` | `returnRequired` | At the station |
| --- | --- | --- | --- |
| Locker | ON | ON | The desk issues a numbered unit and takes it back. |
| Towel | OFF | ON | The desk issues a quantity and counts it back. |
| Shower (or a shampoo sachet) | OFF | OFF | The desk records the use; there is nothing to return. |

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | UUID | no | uuid v4 | Primary key. |
| `companyId` | UUID | no | | |
| `code` | STRING(20) | no | | Upper case, e.g. `LOCKER`, `TOWEL`, `SHOWER`. |
| `description` | STRING | no | | |
| `trackUnits` | BOOLEAN | no | false | ON = numbered units (`UtilityUnit` rows), each issued and returned one by one. OFF = handed out by quantity. |
| `returnRequired` | BOOLEAN | no | true | OFF = a use is recorded and closed at once, never on the "still out" lists. Always ON when `trackUnits` is ON. |
| `stockQuantity` | INTEGER | yes | | Counted items only: the pieces the club owns, so the station shows "42 of 200 out". NULL = not shown. Information only, never a refusal. |
| `maxPerPerson` | INTEGER | no | 1 | Units or pieces ONE person may hold at a time (0 = no limit). For a use-only item: uses per person per day. |
| ~~`dueDays`~~ | | | | DROPPED 2026-11-14 (user rule: nobody keeps an item overnight). Every returnable item is due back the day it was issued; see slice 7. |
| `feeTransactionTypeId` | UUID | yes | | The `issue-fee` billing item charged per unit, piece or use; NULL = free. Intra-service FK, SET NULL. |
| `guestsAllowed` | BOOLEAN | no | true | OFF = members only (a club that keeps lockers for members). |
| `visitingMembersAllowed` | BOOLEAN | no | true | Slice 7 (approved 2026-11-14). OFF = not issued to a visiting member of an affiliated or reciprocal club, nor to a guest they brought. |
| `requiresEntry` | BOOLEAN | no | false | ON = only for a person who is inside a facility today (a live entry or a checked-in booking). OFF = anyone the station may serve. |
| `iconUrl` | STRING(1000) | yes | | The picture on the station's strip, like a facility type's. |
| `sortOrder` | INTEGER | no | 100 | |
| `isActive` | BOOLEAN | no | true | |
| `createdBy`, `createdByDepartmentId`, `updatedBy` | UUID | yes | | Ownership stamps. |

A utility item has no opening hours and no closure plans of its own (today's issue types borrow both from the Facility Type): the station hands items out whenever it is staffed, and a returnable item is due at the end of the day it was issued.

#### `facility.UtilityUnit` - one numbered unit (NEW TABLE)

Model `FacilityUtilityUnit`, table `facility."UtilityUnit"`, unique `(companyId, utilityItemId, code)`, index `(utilityItemId, unitStatus)`.
Only for items with `trackUnits` ON.

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | UUID | no | uuid v4 | Primary key. |
| `companyId` | UUID | no | | |
| `utilityItemId` | UUID | no | | FK to `UtilityItem` (intra-service; an item with units cannot be deleted). |
| `code` | STRING(20) | no | | The number on the unit, e.g. `L014`. |
| `location` | STRING | yes | | Where it is, e.g. "Men's changing room, row B". |
| `unitStatus` | STRING(20) | no | 'available' | `available` / `issued` / `out-of-service` (a lost or damaged return parks the unit until the desk clears it). |
| `currentIssueId` | UUID | yes | | The live `IssueRecord` while `issued`. |
| `remarks` | STRING | yes | | |
| `sortOrder` | INTEGER | no | 100 | |
| `isActive` | BOOLEAN | no | true | |
| `createdBy`, `createdByDepartmentId`, `updatedBy` | UUID | yes | | Ownership stamps. |

#### `facility.IssueRecord` - re-pointed to the utility item, gains the holder (EXISTING TABLE)

The table keeps its name: an issue record is not a facility.
`patronId` changes meaning from "the member holding it" to "the member RESPONSIBLE for it": the host whose bill carries the fee and to whom a loss is charged.
The holder is that member unless the holder columns say otherwise.
New index `(companyId, guestRegistrationId, status)` (find a guest's items by scanning the pass).

| Column | Type | Null | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | UUID | no | uuid v4 | Primary key (unchanged). |
| `utilityItemId` | UUID | no | | RENAMED from `facilityTypeId`; FK to `UtilityItem`. |
| `utilityUnitId` | UUID | yes | | RENAMED from `facilityId`; FK to `UtilityUnit`, NULL for a quantity or a use. |
| `patronId` | UUID | no | | REWORDED: the responsible member (the host). |
| `holderName` | STRING | yes | | NEW. The guest holding or using the item, as a snapshot; NULL = the member. |
| `guestRegistrationId` | UUID | yes | | NEW. The guest's day pass, `membership.GuestRegistration.id` (value ref across the seam, no FK); NULL for a guest without a pass. |
| `registrationGuestId` | UUID | yes | | NEW. The guest's line on the member's entry (intra-service FK to `RegistrationGuest`, SET NULL), when there is one. |
| `status` | STRING(10) | no | 'issued' | Gains `used` for an item with `returnRequired` OFF (closed at issue). `issued` / `returned` / `lost` unchanged. |
| every other column | | | | Unchanged (`registrationId`, `quantity`, `issuedAt`, `dueBack`, `returnedAt`, `returnedQuantity`, `returnCondition`, `feeBillId`, `remarks`, the stamps). |

#### Columns added and removed on the other tables

| Table | Column | Change | Meaning |
| --- | --- | --- | --- |
| `facility.RegistrationGuest` | `guestId` (UUID, null) | ADD | The known guest, `membership.Guest.id` (value ref); passed to the ledger so the guest counts once per host per day. NULL = a name-only line. |
| `facility.RegistrationGuest` | `guestRegistrationId` (UUID, null) | ADD | The day pass behind the line: the one scanned, or the one the station created. Index `(companyId, guestRegistrationId)`. |
| `facility.RegistrationGuest` | `passCreatedHere` (BOOLEAN, default false) | ADD | The station created the pass for this line, so removing the line before sign-out cancels that pass; a pass registered upfront is never cancelled by the station. |
| `facility.Registration` | `hostPresent` (BOOLEAN, default true) | ADD | false = a guest admitted to an entry facility on a pass before the host arrived; the live count then adds the guests only. |
| `facility.FacilitySetting` | `doorGuestPassEnabled` (BOOLEAN, default true) | ADD | ON = a guest keyed at the station with a mobile or an email is registered with Membership and gets the day pass. |
| `facility.FacilitySetting` | `doorGuestContactRequired` (BOOLEAN, default false) | ADD | ON = a guest keyed at the station must carry a mobile or an email, so every guest is known. |
| `facility.FacilityType` | `usageMode` value `issue` | REMOVE | Facility types are `slot` or `entry` only. |
| `facility.FacilityType` | `trackUnits`, `maxIssuePerPatron`, `issueFeeTransactionTypeId`, `issueDueDays` | REMOVE | Moved to `UtilityItem`. |
| `facility.Facility` | `unitStatus`, `currentIssueId` | REMOVE | Moved to `UtilityUnit`. |

`Bill` is unchanged: `issueRecordId` stays the source of a bill opened for utility items.

#### Moving what exists (at boot, before the schema sync)

`modules/facility/utilityMigration.js`, called from `src/app.js` inside the sync lock just before `sequelize.sync` (the sync would otherwise add a NOT NULL `utilityItemId` beside the old column and fail on the existing rows); `scripts/migrate-facility-utility-items.js` runs the same step by hand.
Idempotent (it does nothing once `IssueRecord` has lost `facilityTypeId`, or on a fresh database) and ONE transaction after the two tables are created.
Each utility item keeps the id of the facility type it came from and each unit the id of its facility row, so every issue record and the bill hanging off it stay valid through a plain column rename.
Verified on a throwaway Postgres 18 with a locker type (a unit issued with its bill, a unit parked out of service), a counted towel type, a fee item and a closure plan: both types moved, the units kept their state, the issue records and the bill resolved, the alter-sync rebuilt the two foreign keys, and a second run did nothing.
What it does:
every Facility Type of usage mode `issue` becomes a `UtilityItem` with the same code and settings (`returnRequired` ON);
its Facility rows become `UtilityUnit` rows when the type tracked units (the single counter row of a counted type is dropped);
every `IssueRecord` is re-pointed (the two renamed columns);
a billing item whose `facilityTypeId` named the old type has it cleared (the utility item names its fee itself);
the old types, their facility rows and any closure plan on them are deleted, and the retired columns dropped.
On dev this is Tropicana's LOCKER type with L001 and L002.

#### Membership additions (owned by Membership; no table change)

`membership.GuestRegistration.channel` already lists `facility`.
Three calls join `platform/membershipGateway.js`, each a thin wrapper over `guestRegistration.service.js` and `guestVisit.service.js`:

- `findGuestPass(companyId, code)` - the pass behind a scanned link or token: the registration id and number, the guest (id, name), the host (member id, number, name), the visit date, the derived state (`valid` / `upcoming` / `expired` / `cancelled`) and whether it is already `arrived`.
- `registerGuestAtDoor(req, { memberId, visitDate, guest, channel: 'facility' }, { transaction })` - finds or creates the `Guest` by the Guest Registration rules (same name and the same mobile or email is the returning guest), returns the live registration of that guest with that host for the date when one exists, else creates one already `arrived` with its number from the `membership-guest` series; `cancelGuestAtDoor` undoes one the station created.
  No "Guest Registration No." series = the line is kept name-only with a warning to the desk, never a refusal at the door.
- `markGuestArrived(companyId, guestRegistrationId, { actorId, transaction })` - idempotent; the pass page then shows the guest as arrived.

`recordGuestVisit` already takes `guestId`; the station now sends it.
`getGuestAllowanceStanding` gains an optional list of guest ids and answers how many of them are already counted for the host that day, so the door's allowance check asks only for the guests who would draw a new visit.

#### Who the station serves (the user's rule, binding)

1. **A member** claims utility items on their member number, as today.
2. **A guest with a pass** (registered upfront, or registered by the station earlier that day) is served ON THE PASS ALONE: the desk scans it and issues the guest's items; the member need not be there.
   The pass must belong to this club, be valid today by the club clock and not cancelled; an upcoming or expired pass is refused with its date.
   The first scan of the day marks the pass arrived.
   The host named on the pass is the responsible member: the fee goes on the host's bill and a loss is charged to the host.
3. **A guest without a pass** is served ONLY TOGETHER WITH THE MEMBER: the desk keys the member's number (the member is at the counter) and adds the guest to that member's arrival.
   Keyed with a mobile or an email, the guest is registered on the spot and holds a pass from then on, so later that day they come back to the station on their own.
   Keyed with a name only, the guest has no pass and every later claim again needs the member at the counter.
4. **A member who comes as another member's guest** claims on their OWN member number, as a member.

#### The two walk-throughs (a member and one guest, pool + towel + locker each)

**With the guest registered upfront (the guest holds a QR pass).**
1. The desk presses **Arrival** and scans the guest's pass (camera, or a handheld scanner typing into the field).
2. The drawer fills the host from the pass (name, member number, standing, the monthly allowance) and adds the guest as a line marked "Pass G2611-00012, valid today".
   The member, standing beside the guest, is ticked as arriving too; a guest who came alone leaves the member unticked.
3. The desk picks the pool, and ticks Towel and Locker on the member's line and on the guest's line.
4. The preview states the outcome before anything is saved: 2 people into the pool (38 of 40 after this), the guest already counted today by the pass (no further draw on the allowance), lockers L003 and L004, 2 towels, the fees per line and the total on ONE bill in the member's name.
5. **Admit 2 and issue 4 items** saves everything in one transaction: the entry, the guest line, the pass marked arrived, the four issue records each naming its holder, and the bill.

**Without upfront registration (the guest is at the counter with the member).**
1. The desk presses **Arrival** and keys the member number.
2. The desk adds the guest: the participant type, the name, and a mobile or an email.
3. Steps 3 to 5 as above.
   On save the station registers the guest with Membership (a Guest Registration on channel `facility`, already arrived), the result view offers Email and WhatsApp for the pass, and the visit counts once per host per day like any known guest.

**Later in the day.**
The guest wants a shower: the desk scans the guest's pass and issues SHOWER to the guest; the member is not needed.
Return: the desk scans the pass or keys the member number, and the board narrows to that party's rows, each showing its holder ("L004 - Tan Wei Ming, guest of Ahmad Faizal").
Sign-out of the entry lists what the party still holds, with Return beside each.

#### Decisions proposed here and open for your change

1. **Whose account.** A guest's utility item fees go on the HOST's bill, priced at the guest's participant type - also when the guest claims alone on the pass, so the member is billed without being at the counter.
2. **Shower.** Modelled as a use with nothing to return (`trackUnits` OFF, `returnRequired` OFF); a club that hands out a shower-room key sets it up like a locker instead.
3. **No hours or closures on a utility item** (see the master above).
4. **`stockQuantity`** is information only.
5. **`requiresEntry`** defaults OFF: a guest with a pass claims a towel without first being registered into a facility.
6. **A guest with no mobile or email** is allowed by name only, together with the member; `doorGuestContactRequired` ON insists on the contact.
7. **Entering a facility alone on a pass** (as opposed to claiming an item) follows the facility type's existing `hostMustBePresent` flag: ON refuses the guest until the member is in the party or already inside today.
8. **The limit is per person** (`maxPerPerson`): the member and each guest may each hold up to the limit.
9. **Booked courts.** The guests on a booked slot's roster keep today's behaviour in this slice; giving the booking's guest lines the same identity and pass is a following step.

#### Station rules (binding at the desk)

1. **The party** is one host member plus zero or more guest lines; the member's standing gates it as in slice 3 (barred refuses, warning shows).
   A pass of a different host than the party's is refused ("start a separate arrival").
2. **A keyed guest** with a mobile or an email becomes a known guest through `registerGuestAtDoor` when `doorGuestPassEnabled` is ON; with `doorGuestContactRequired` ON a line without either is refused.
3. **The guest rules of slice 2 and 3 run unchanged** on an entry's lines (exception, then the type's policy, then the general flags; `maxGuestsPerBooking` per visit), and the monthly allowance is checked for the lines that would draw a NEW visit only.
4. **The entry** (when an entry facility is picked) follows slice 3 rule 2: opening hours, closures, the capacity against the people actually arriving (`hostPresent` false counts the guests only), `entryRequiresBooking`.
5. **Each utility item** names its holder; `guestsAllowed` OFF refuses a guest; the limit is checked per holder; a tracked item is the picked unit or the next available, a counted item is a quantity, a use-only item closes as `used` at once; `requiresEntry` ON refuses a holder who is not inside.
6. **Fees**: each item's fee at the HOLDER's participant type (`member` for the member, the line's type or the system `guest` type for a guest on a pass), on the arrival's one bill in the host's name; an entry adds its entry fee and guest fees to the same bill as slice 3 rule 8.
7. **One transaction**: the entry, the lines, the passes created or marked arrived, the ledger lines, the issue records, the units flipped to `issued` and the bill commit together or not at all; the preview and the save run the same checks.
8. **Return and sign-out**: a return is found by the pass, the member number or the board; `good` frees a unit, `damaged` or `lost` parks it out of service as today; sign-out of an entry lists the party's items still out and never blocks; the end-of-day list keeps what is overdue.
9. **Removing a guest line** before sign-out voids its ledger line as today, refuses while the guest still holds an item, and cancels the pass only when the station created it.

#### Slice 6 screens and API

- `/facility/utility-items` - **Utility Items** (NEW master screen, a menu the user adds): the listing cards (code, description, a chip for Numbered units / By quantity / Use only, units free of total or pieces out), New and Edit in the standard drawer with the two behaviour switches explained by example, and a **Units** view for a numbered item with "Generate units" (prefix, from, to, with a preview of the codes it will add and the ones that already exist).
- **Facility Types** loses the "Issue and return" mode and its fields; **Facilities** lists places only.
- **Control Station**: the Issue view becomes **Utility Items** (one chip per utility item: the unit board or the counter), and the header gains **Arrival** and **Scan pass**, available from every view.
  Arrival is ONE drawer in the station's existing dialog (mode `arrival`): the party (member number or a scanned pass, the guest lines with type, name, mobile, email and a per-line Scan), the facility to enter (or "Items only"), a row per person with a tick per utility item (quantity for a counted item, the unit picker for a numbered one), and the live preview of rule 7 with the concrete button label ("Admit 2 and issue 4 items").
  The result view lists the registration number, each person's locker, the bill, and the pass of every guest the station registered, with Email and WhatsApp.
- The **Issue** form asks "For": the member, a guest of the member's party, or a scanned pass; the board and the lists show the holder and the host on every row; **Return** accepts a scanned pass to narrow the board.
- The **Register** and **Guests** forms gain the mobile and email fields and the per-line Scan, so the single-member path gives the same pass and the same counting.
- **Facility Specification** gains the two door switches in its guest card.
- API: `/api/facility/utility-items` (GET, POST, PUT, PATCH active, DELETE; `/:id/units` GET, POST, PUT, PATCH active, DELETE; `POST /:id/units/generate` with a preview flag) under the `/facility/utility-items` grant, readable on the station's grant.
  Under `/api/facility/station`: `POST /scan` (code: the pass and that party's picture for today), `GET /party?memberNo` (the host's standing and allowance, the guests inside, the items out), `POST /arrivals/preview` and `POST /arrivals` (memberNo, hostPresent, facilityTypeId or none, facilityId, the guest lines each with an optional guestRegistrationId, the items each with its holder), `POST /issues` re-keyed to utilityItemId and utilityUnitId with the holder (the member, a registrationGuestId or a guestRegistrationId), `GET /today` returns the utility items beside the facility types and the holder and host on every issue row.
- Build order inside the slice: 6a the Utility Item master (the two tables, the migration script, the master screen, the station's Utility Items view on the new tables, the use-only behaviour) - same behaviour as today under the new name; 6b the known guest at the door (the seam calls, the `RegistrationGuest` columns, Scan and contact on the Register form, counting once); 6c the holder (the `IssueRecord` holder columns, "For", a pass served alone, the per-person limit, the fee at the holder's type, return by pass, the sign-out list); 6d the Arrival drawer (the party in one transaction with its preview, `hostPresent`).
  On approval the slice 1 and slice 3 text above that describes the "issue" usage mode is marked superseded by this section.

#### Scan and serve - the station starts from the person (approved 2026-11-12; 6b and 6c BUILT and smoked on dev 2026-11-12; 6d BUILT 2026-11-12, smoked on dev 2026-11-12 and 13)

**Status:** drafted 2026-11-12 after the 6a smoke, at the user's request, and approved the same day with its nine decisions as proposed.
It revises the build order 6b, 6c and 6d above and replaces the Arrival drawer as the station's main path.
It adds NO table and NO column beyond the ones already approved in this slice.
Step 6b built 2026-11-12: the Membership seam (`findGuestPass`, `getGuestPass`, `markGuestArrived` in platform/membershipGateway.js over guestRegistration.service.js); `IssueRecord.holderName` and `guestRegistrationId` with their index; the pure rules in stationRules.service.js (unit-tested: what was scanned, the pass verdict, the tile verdict, the undo window); `POST /station/scan` and the Serve panel's picture; the issue re-keyed to its holder with the limit per holder, `guestsAllowed` and `requiresEntry` enforced; one open bill per person per day; `POST /station/issues/:id/undo`; the holder and the host on every issue row; the scan box and the Serve panel on the station screen; the two serving switches on the Utility Items screen.
Verified before any deploy on a throwaway Postgres 18 driving the service the way the panel does (38 checks): the scan of a link and of a bare token, the arrival on the first scan only, a tap per item onto one bill, the limits per holder, undo of a towel, of a use and of the only line of a bill (the bill voided), the member's own panel and bill, every refusal at the scan, the board row's holder, undo refused after a settled bill and after five minutes.
Built as drafted with these notes:
the Undo of an item finds its bill line by the fee item, the quantity and the moment it was written (no column links an issue to its line), and leaves the fee on the bill with a message when it cannot tell;
a guest is always refused an item with `requiresEntry` ON until 6d lets a pass enter a facility, and the Utility Items screen says so beside the switch;
Return in the panel takes an item back in good condition in one tap, with "Return damaged or lost" in the row's menu;
the "next person" scan field inside the panel is shown on a desk with a keyboard and a mouse only, and takes the focus back after every tap so a handheld scanner's Enter never presses a tile; a phone or a tablet scans with the camera from the scan box;
the member-number form stays on the counted and the use-only views for issuing several pieces at once; a numbered unit is now issued from the panel only.
Smoked on dev 2026-11-12 at Tropicana, in the user's Chrome, with guest pass GR00001 (Tan Wei Ming, guest of MEM26-000001; the club's Guest Registration No. series was added for it, prefix GR):
the pass link keyed into the scan box opened the panel and marked the arrival; a tap issued L001 and opened bill FBL-00013 in the host's name; a tap issued a towel; a tap recorded the shower use; the limits closed each tile with its reason (holding 1 of 1, holding 2 of 2, used 1 of 1 today); Undo took a towel back; "Return in good condition" and the damaged-or-lost form were reached from the row's menu; a free unit tapped on the board (L003) was offered first to the member keyed next; the member's locker went on the member's own bill FBL-00014 and its Undo voided that bill; an unknown code was refused with its message; the bare token keyed in the panel's next-person field swapped the panel to the guest without a second arrival; the bill title read "LOCKER L001 for Tan Wei Ming"; Shower with "Guests may take it" OFF showed "Members only" on its card and on the guest's tile (switched back ON after).
Polish found by that smoke and fixed the same day:
a code refused inside the panel now stays selected in the next-person field (the focus had slipped to the scan box behind the drawer);
the return form opened from the panel opens on Damaged and its footer is Back, to the person being served (Cancel had closed the drawer);
a use is listed under its own heading "Used today", apart from "Holding now", and the Undo hint shows only while something can be undone;
a unit picked on the board is captioned "picked", not "next free";
the return message names what came back ("TOWEL returned.", "L001 returned.").
Those five were pushed and re-checked on dev the same day, each one seen working.
One more came out of the re-check and is fixed: the focus returning to the next-person field after a tap now selects a refused code still sitting there, so the next scan replaces it and is never appended to it.
That one was pushed and seen working on dev the same day too.
Not checked on dev: the camera scanner (it needs the device's camera permission) and phone width (the Chrome window cannot be resized by the smoke).

Step 6c built and smoked on dev 2026-11-12 (the guest without a pass, with the member).
What it is: the member's Serve panel gains **Add guest** (the guest's name, a mobile, an email).
Keyed with a mobile or an email while "Give a day pass to a guest keyed at the station" is ON, the guest is registered with Membership on channel `facility`, already arrived, and the panel then serves that guest, who holds a pass from then on; the pass is handed over from the panel (its QR code, WhatsApp, email, and "Hand over the pass" shows it again later).
Keyed with a name only, the guest is served by name together with the member: the issue record carries `holderName` with no `guestRegistrationId`, and the guest is found again through the member's panel, which lists the guests served under the member.
The party is served one person at a time: a guest's panel has "Serve <the member>", the member's panel a button per guest.
Verified before any deploy on a throwaway Postgres 18 driving the service the way the screen does (54 checks): the pass created arrived on the facility channel and counted once; the same guest keyed twice keeps one pass; the pass shown and sent again; a guest by name served, listed under the member, found again in other capitals, the member's own limits untouched; ONE visit at the guest's first item and given back when the last one is undone; a mistaken guest removed (pass cancelled, visit voided) but never one who took something nor a pass the front desk registered; the two switches; no number series (by name, with a warning); an exhausted allowance refusing a new pass and a new guest by name while a guest already counted is still served; an entry's lines on a desk pass, with a mobile and by name, a known guest counted once across the pass and the line, a line taken off refused while the guest holds an item, cancelling only a pass the station created.
The 6b scenario (38 checks) was run again unchanged.
Built as approved with these notes:
"Add guest" asks no participant type - a guest on a pass is priced at the system guest type as in 6b, and a type has nowhere to live until the guest stands on an entry line (6d);
a guest served by name draws ONE visit on the host's monthly allowance for the day, at their first item (ledger source `facility`, the issue record as its reference), given back when their last item of the day is undone; an exhausted allowance refuses a new guest by name as it refuses a new pass;
"Added by mistake - remove" is offered only for a pass the station registered and only while the guest has taken nothing; it cancels the pass and voids its visit (`cancelGuestAtDoor`);
no automatic Guest Registration No. series (none, or a manual one) = the guest is served by name with a warning, never refused;
`getGuestAllowanceStanding` did not need the list of guest ids: the door registers the known lines first (each checks the allowance itself) and then checks the remaining draw for the lines without a guest record;
the seam gained two calls beyond the three approved ones, so the pass is handed over on the station's own grant: `getGuestPassShare` and `sendGuestPass`; the pass facts carry the registration's `channel`;
an entry's guest lines (the Register and Guests forms) gain Mobile and Email and keep the pass they stand on (`guestRegistrationId` on the line), but no per-line Scan - a pass is scanned in the scan box;
`IssueRecord.registrationGuestId` is still not added: it arrives with 6d.
Smoked on dev 2026-11-12 at Tropicana, in the user's Chrome, under member MEM26-000001:
the member's panel showed "Guests" with the guest of the 6b smoke and Add guest; a guest keyed with a mobile (Siti Aminah) was registered as pass GR00002, arrived, and the panel served her with the pass block (QR code, Share via WhatsApp, Open pass); a towel issued to her took "Added by mistake - remove" away; "Serve Ahmad Faizal" stepped back to the member, whose panel listed both guests; a guest keyed with a name only (Lim Ah Kow) was served by name, took locker L002 on bill FBL-00015 in the host's name, appeared on the board as "L002 - Lim Ah Kow guest of Ahmad Faizal" and in the member's list, and the Undo voided that bill; a guest added by mistake (pass GR00003) was removed after the confirmation and the panel returned to the member; Facility Specification showed the two switches at their defaults, and with the contact switch ON the Add guest form refused a name alone before sending anything (switched back OFF after).
The entry form's guest line showed its Mobile and Email fields, but an entry with a guest could not be saved on dev: Tropicana's own guest-control rule refuses visitor guests on GYM, so that path stands on the local verification.
Polish found by that smoke and fixed: the Add guest form opens with the keyboard in the name field; its outcome line stands clear of the fields; its button reads "Register and serve" when the club asks for a contact; removing a guest returns the focus to the next-person field; the Control Station card of Facility Specification names the guest settings in its subtitle; the guest-rule refusal at the door reads its date as a date.
Those were pushed and re-checked on dev the same day: the name field held the keyboard, the outcome line stood 16px clear, removing a guest (pass GR00004) left the focus in the next-person field, the card subtitle read as changed and the refusal said "12 Nov 2026"; the button label under the contact switch was not re-checked on dev (its test covers it).
Not checked on dev: the WhatsApp and email sends (no real recipient), the camera scanner and phone width.

Step 6d built 2026-11-12 (entering a facility from the panel; the member path smoked on dev the same day).
What it is: the Serve panel gains **Enter a facility**, one tile per active entry facility, each stating before it is tapped the price and the count the tap will reach ("13 of 40 inside after this"), or why it cannot be tapped.
A tap admits ONE person.
The member gets an entry of their own, or - when their guests went in ahead on a pass - joins that entry.
A guest (on a pass, or by name with the member) becomes a line on the host's live entry of that facility; when the host is not inside, the guest opens an entry in the host's name with `Registration.hostPresent` false, which a type with `hostMustBePresent` ON refuses ("Ahmad Faizal must enter POOL first").
A person who is inside is shown so on the tile, with **Sign out** where the entry is theirs (the member's, or a guest's own while the host is not in) and "signs out with <the member>" where it is not.
Sign-out never blocks and says what the party still holds ("Still out: L003 (Tan Wei Ming), TOWEL (Ahmad Faizal)").
Verified before any deploy on a throwaway Postgres 18 driving the service the way the screen does (54 checks): the tiles' price, count and reasons; a guest admitted alone on the pass (host not present, counted once, the guest fee billed, the pass arrived); the inside-only utility item opening to the guest inside; the Register form refusing to open a second entry behind the guests; the member joining that entry (one entry, the entry fee on the SAME bill, the member's towel on it too: one open bill); a guest by name admitted onto the member's entry drawing ONE visit that an item and its undo leave alone; the capacity; the host-must-be-present type; the guests-per-visit cap; the sign-out list naming each holder; a second visitor-guest type picked on the tile; the guest rule and the monthly allowance.
The 6b scenario (38 checks) and the 6c scenario (54 checks) were run again unchanged.
Built as approved with these notes:
"the host already inside" means the host stands on a live entry of THAT facility now;
the entry fee and the guest fee go on the ENTRY's bill (the one it carries while open, else the member's open bill of the day, else a new one), so the member keeps ONE open bill with their utility items; a guest's own utility items stay on the guest's bill of 6b, also in the host's name;
a guest's line takes the system guest type unless the club keeps more than one visitor-guest type, in which case the tile offers the pick (this is where the participant type left out of "Add guest" in 6c went);
the panel admits against the type's capacity and offers no unit pick and no member-as-guest line - the Register form keeps both;
a guest on the host's entry signs out with the host, as an entry always signed out as one;
a wrong admit has no Undo: it is corrected by Sign out and by removing its line on the bill;
the Register form refuses to open a second entry for a member whose guests are already inside, and points to the panel;
`IssueRecord.registrationGuestId` was NOT added: nothing reads it - a party's items are found by the pass or, for a guest by name, by the host and the name;
the live count and the Guests form's capacity check add the host only when the host is inside.
Smoked on dev 2026-11-12 at Tropicana, in the user's Chrome, under member MEM26-000001:
the member's panel showed "Enter a facility" with the GYM tile ("No fee", "1 of 40 inside after this"); a tap admitted the member (RG-00003, the strip and the register read 1 of 40) and the tile turned to "Inside since ... RG-00003" with Sign out; the guest's panel showed the same tile closed in words by the club's own rule ("Visitor guests are not allowed on GYM now"); Sign out from the member's panel answered "RG-00003 signed out. Still out: TOWEL (Ahmad Faizal)." and the tile went back to Admit.
The GUEST path (a guest admitted alone or onto the member's entry, the host-must-be-present refusal, the fees on the entry's bill) could not be exercised on dev: Tropicana's guest-control rule refuses visitor guests on GYM and it has no other entry facility, so that path stands on the local verification.
Polish found by that smoke and fixed:
a free facility no longer warns "the entry fee was not charged" after every admit - its tile said "No fee" before the tap (a picked guest type with no fee item of its own still warns);
a fee item with no price in force now closes the tile in words ("GUESTFEE has no price today.") instead of letting the tap be refused at the bill.
The local scenario was run again with both (56 checks).
Both were pushed the same day; on dev the admit to GYM then answered "Ahmad Faizal is in GYM (RG-00004) - 1 of 40 inside." with no warning. The no-price reason could not be seen on dev: the guest rule closes that tile first.
The GUEST path was smoked on dev 2026-11-13, at the user's word.
What stood in the way was not the club-wide guest rule (it allows visitor guests) but the GYM facility type's own "Visitor guests allowed" being OFF; it was switched ON for the smoke and back OFF after, and the default guest fee item GUESTFEE, which had no price card, was given one at the user's choice (Guest / Visitor, all days, 10.00 from 13 Nov 2026 - kept).
Seen: a guest added in the member's panel (Wong Mei Ling, pass GR00005) had the GYM tile closed with "Ahmad Faizal must enter GYM first." (the type keeps "host must be present" ON); with the member admitted (RG-00005) and before the price existed the tile read "GUESTFEE has no price today."; with the price it read "10.00 before tax, on Ahmad Faizal's bill" and "2 of 40 inside after this"; the tap answered "Wong Mei Ling, guest of Ahmad Faizal, is in GYM (RG-00005) - 2 of 40 inside." and the register showed the entry with its guest and bill FBL-00016 open; the guest's tile read "Inside ... signs out with Ahmad Faizal"; the member's panel showed the bill at 10.00 and "Sign out with 1 guest"; the sign-out answered "RG-00005 signed out. Bill FBL-00016 is still open. Still out: TOWEL (Wong Mei Ling)."
Not exercised on dev: a guest entering ALONE (GYM keeps the host-must-be-present rule and is the club's only entry facility) - that case stands on the local verification.
Found by that smoke and fixed (the three local scenarios run again: 38, 55 and 61 checks):
the member's Guests list now carries every guest of the day - today's passes of that member (`listGuestPassesOfHost`, a fifth seam call) and the guests on the lines of the member's entries - not only the ones who already took an item, so a guest added a moment ago is one tap away;
"Added by mistake - remove" is no longer offered, and the removal is refused, once the guest has entered a facility on the pass (the panel's `pass.removable` says so);
a guest's panel shows the open bill of the entry they stand on while they have no bill of their own, so the guest fee just charged is in sight.
Those three were pushed and seen on dev the same day: the member's Guests list carried Wong Mei Ling with nothing held, her panel no longer offered the removal, and it showed "Open bill FBL-00016 - 10.00 - in Ahmad Faizal's name" with its Bill button.

The user's point.
The station has no scan of the guest's pass, and it is not friendly: the desk picks an item first and keys the person after, once per item.
Issuing a locker and a towel to one person today takes about nine actions and the member number is typed twice.
A guest holding a pass cannot be served alone at all, and what the guest takes is recorded under the member's name.
The user asked for three steps: scan, assign the locker, issue the towel.

##### The three steps

1. **Scan.**
   The desk scans the guest's pass.
   One panel opens for that guest.
2. **Assign the locker.**
   One tap on a free locker in the panel issues it.
3. **Issue the towel.**
   One tap on the Towel tile issues one towel.

Nothing else is keyed and nothing is confirmed separately.
The panel stays open, so a shower or a second towel is one more tap, and the next scan replaces it with the next person.

| | Today (6a) | Scan and serve |
| --- | --- | --- |
| A guest with a pass, alone | Not possible | 3 actions |
| A locker and a towel for one person | About 9 actions, the member number typed twice | 3 actions |
| Who the record names | The member | The guest, with the host as the responsible member |
| The guest's arrival | Not recorded at the station | Marked on the first scan of the day |

##### The scan box

- A single field at the top of the station, above the strip, on every view: "Scan a guest pass or key a member number".
- It holds the keyboard focus whenever no drawer is open, and takes it back when the panel closes, so a handheld scanner works without touching the screen.
- A handheld (keyboard-wedge) scanner types the code and presses Enter; a camera button beside the field opens the shared `<app-qr-scanner>` for a tablet or a phone.
- What was read decides who is served: a pass link (`/guest-pass/<token>`) or a bare pass token is a guest; anything else is taken as a member number.
- A code that is neither is refused in words ("That is not a guest pass of this club or a member number").

##### The Serve panel

ONE drawer in the station's existing dialog (mode `serve`), full screen on a phone.

- **Who.**
  The guest's name, "guest of Ahmad Faizal (MEM26-000001)", the pass number, "valid today", and "arrived 09:52" once marked.
  For a member: the name, the member number and the standing.
  A warning on the host's standing shows here as it does on the forms today; a barred host refuses the panel with the reason.
- **Holding now.**
  What this person holds at this moment (locker L003, 1 towel), each row with Return and, for a few minutes after it was issued, Undo.
- **The tiles.**
  One tile per active utility item, in the item's sort order.
  Every tile states its outcome before it is tapped, so no confirmation is needed:
  - a numbered item (Locker) shows its free units as buttons with the next free one highlighted; a tap on a unit issues that unit;
  - a counted item (Towel) is one button "Towel - issue 1", with "holding 1 of 2" beside it; each tap issues one piece;
  - a use-only item (Shower) is one button "Shower - record use".
  - Each tile carries its price line: "Free", or "5.00 before tax, on Ahmad Faizal's bill".
- **A tile that cannot be tapped says why**: "Members only", "Limit reached - holding 1 of 1", "No unit free", "LOCKERFEE has no price today", "Only for a person inside a facility".
- **The bill.**
  When an item carries a fee, the panel shows the open bill and its total with a Bill button to the existing bill drawer.
  Settling is not one of the three steps: the desk settles when the person pays, or charges the member's account.

##### What a scan does

1. Reads the pass through Membership: `findGuestPass(companyId, code)` (already in this slice's seam list).
2. Refuses a pass of another club, a cancelled pass, and a pass for another day with its date ("This pass is for 14 Nov 2026").
3. Marks the pass arrived on the first scan of the day: `markGuestArrived`.
   The guest's visit was counted on the host's monthly allowance when the pass was registered, so the scan draws nothing more.
4. Returns the panel's picture: the guest, the host and the host's standing, what the guest holds, and the tiles with their reasons.

A typed member number returns the same picture for the member.

##### Rules (binding at the desk)

1. **The holder is the person scanned.**
   The issue record names the guest (`holderName`, `guestRegistrationId`) and keeps the host as the responsible member (`patronId`), as approved above.
2. **The limit is per holder** (`maxPerPerson`): a guest and the host may each hold up to the limit.
3. **`guestsAllowed` OFF** refuses a guest on that item; **`requiresEntry` ON** refuses a holder who is not inside a facility today.
4. **A numbered item** is the tapped unit, taken under a lock; a unit another desk took a second earlier is refused and the tile refreshes.
5. **A counted item** issues one piece per tap, each its own issue record, so each can be undone or returned on its own.
6. **Fees** follow decision 1 of this slice: priced at the holder's participant type, on the host's bill.
   A person's paid items of one day go on ONE open bill: the first opens it, the next ones add their lines to it while it is open.
7. **Undo** is for a wrong tap: within a few minutes, while its bill line is unpaid, it takes the item back as a good return, removes the bill line (voiding a bill left empty) and notes "Undone at the desk" on the record.
   After that the item is returned the normal way.
8. **Return** is found by scanning the pass again (the panel's "Holding now" list), by the member number, or on the board as today.
9. **Every row on the board and the lists names its holder and the host** ("L003 - Tan Wei Ming, guest of Ahmad Faizal").
10. The preview-then-save rule of the Arrival drawer is replaced by tiles that state their outcome; the same checks run when the panel is drawn and again when a tile is tapped.

##### What stays and what changes in this slice

- **Stays as approved:** the two tables of 6a; the holder columns of `IssueRecord`; the `RegistrationGuest` and `Registration` columns; the two door switches; the Membership seam calls; "Who the station serves"; decisions 1 to 9.
- **Changes:** the Arrival drawer (a party keyed in one form with ticks per person and one save) is replaced by the Serve panel (one person at a time, a tap per item).
  A member and a guest arriving together are two scans, or one scan and one member number.
- **The strip and the boards stay** as the overview of the day and as the place for returns and the end of day.
  Tapping a free unit on the board asks for a scan or a member number in the same panel, not in a separate form.

##### Data and API

- `facility.IssueRecord`: `holderName`, `guestRegistrationId` and the index `(companyId, guestRegistrationId, status)` arrive with the first step below, as approved; `registrationGuestId` arrives with the step that needs it.
- No new status: an undone item is a `returned` record with its remark.
- `Bill` is unchanged: its `issueRecordId` names the first item of the visit, and every further item points at the same bill through its own `feeBillId`.
- Under `/api/facility/station`, on the station's grant:
  - `POST /scan` `{ code }` - the panel's picture: `{ kind: 'guest' | 'member', person, host, pass, standing, holding, tiles, bill }`, each tile `{ utilityItemId, code, description, behaviour, fee, allowed, reason, held, limit, freeUnits, suggestedUnitId }`;
  - `POST /issues` gains the holder: `guestRegistrationId` in place of `memberNo`; the server takes the host from the pass, never from the browser;
  - `POST /issues/:id/undo`;
  - (6c) `POST /door-guests` `{ memberNo, name, mobile, email }` - adds the guest and answers the GUEST's panel with `share` (the pass to hand over) when one was registered; `GET /door-guests/:id/pass`; `POST /door-guests/:id/send` `{ via }`; `POST /door-guests/:id/remove`;
  - (6d) `POST /admissions` `{ facilityTypeId, the person, participantType, panel }` admits one person; the panel's picture carries `entries` (one per entry facility: `liveCount`, `capacity`, `willReach`, `fee`, `allowed`, `reason`, `inside`, `hostInside`, `guestTypes`); `POST /registrations/:id/sign-out` answers `stillOut`;
  - (6c) `POST /scan` and `POST /issues` take `guestName` with `memberNo` for a guest served by name; a member's panel carries `guests` (served under them today) and `door` (the two switches);
  - `GET /today` carries the holder and the host on every issue row.

##### Build order (replaces 6b, 6c and 6d)

- **6b Scan and serve.**
  The scan box; the Serve panel for a pass and for a member number; `findGuestPass` and `markGuestArrived`; the holder columns; a tap issues; Undo; one open bill per person per day; the holder on every row; return from the panel.
  This step alone delivers the three steps above.
- **6c The guest without a pass, with the member (BUILT 2026-11-12).**
  "Add guest" in the member's panel (name, mobile or email - the type waits for the entry line of 6d); `registerGuestAtDoor`; the `RegistrationGuest` columns and the two door switches; the guest counted once; the panel then serves that guest, who holds a pass from then on.
- **6d Entering a facility from the panel (BUILT 2026-11-12).**
  The entry facilities (pool, gym) as tiles beside the utility items, "Pool - admit" with the count it will reach; `hostPresent` and the type's `hostMustBePresent`; the entry fee and the guest fee on the same bill; sign-out lists what the person still holds.

##### Decisions (approved as proposed 2026-11-12)

1. **A tap issues at once.**
   The alternative is to tick the items and press one "Issue" button: safer against a wrong tap, but four actions, not three.
   Proposed: issue at once, with Undo.
2. **The locker is the desk's pick.**
   The next free unit is highlighted and any free unit can be tapped, so the screen matches the key the desk hands over.
3. **One towel per tap.**
   A second tap issues a second one, up to the limit.
4. **One open bill per person per day** for utility items, in the host's name.
5. **Undo for five minutes**, and only while the bill line is unpaid.
6. **Both scanners.**
   A handheld scanner into the scan box, and the camera for a tablet.
7. **A member is served by the typed member number.**
   A scan of a member's own card can join later if the club prints one.
8. **A party is served one person at a time**; the Arrival drawer is dropped.
9. **The scan does not admit the guest into the pool or the gym** until 6d; in 6b it serves utility items only.

### Slice 7 - Visiting members at the station (approved 2026-11-14; step 7a BUILT and smoked on dev 2026-11-14; step 7b BUILT 2026-11-14)

A member of an affiliated or reciprocal club is a VISITING MEMBER.
They present their letter at Membership's Registration Counter (the club's main control counter), never at the Facility station, and leave the counter with a day pass.
The station only scans that pass.
The counter, the letter and the pass are Membership's (`membership-management.md`, "Built: Registration Counter"); this slice is what the station does with the pass.

#### User decisions (2026-11-14)

- The letter is shown at the Registration Counter, and the QR code is always a pass for ONE day; the visitor stops at the counter on each day they come.
- **Nobody keeps a locker overnight.**
  On day 2 the visitor holds a new pass and is given a new locker.
  The rule is for everyone, members included, so the "Due back after (days)" setting of a utility item is removed.
- The two "Visiting members allowed" switches and the four new vocabulary values below were approved as proposed, with both switches ON by default and Affiliated and Reciprocal as two price groups.

#### Structures

No new table.

| Table | Column | Change | Meaning |
| --- | --- | --- | --- |
| `facility.UtilityItem` | `visitingMembersAllowed` BOOLEAN, not null, default true | ADD (7a) | OFF = the item is not issued to a visiting member, nor to a guest they brought. |
| `facility.FacilityType` | `visitingMembersAllowed` BOOLEAN, not null, default true | ADD (7b) | OFF = a visiting member may not enter the facility. |
| `facility.UtilityItem` | `dueDays` | DROP (7a) | Every returnable item is due back the day it was issued. Dropped at boot (`src/app.js`, outside the fingerprint gate, idempotent); `IssueRecord.dueBack` stays and is the end of the issue day. |

New values in existing columns:

| Where | Values | Meaning |
| --- | --- | --- |
| `facility.Patron.patronType` | `affiliate`, `reciprocal` (7a) | The person record of a LETTER: `sourceId` = the membership `AffiliatedVisit.id`. The keys are Membership's own patron groups. |
| Participant types, system rows | `affiliate`, `reciprocal` (7b) | What a visiting member's entry fee is priced as on the rate cards. |

#### Who a visiting member is in Facility

- One `Patron` row per letter, not per day and not per pass.
  The profile stays on the letter in Membership; the row keeps the visitor's name as a snapshot.
- `Patron.memberNo` stays NULL.
  The visitor's number belongs to the home club and must never be read as a member number of this club (a reciprocal member numbered `M001` is not this club's member `M001`).
- One row per letter is what lets the station see on day 2 what the visitor left out on day 1: the unreturned locker shows as overdue on the new pass and holds the limit, so no second locker is given until it is back or recorded lost.
- A visiting member's row is left out of the desk search that books (`patron.service.search`): they are served on the pass and do not book.

#### The holder at the station

| Who is scanned | `kind` on the panel | The records | Bill |
| --- | --- | --- | --- |
| The visiting member's own pass | `visiting` | `patronId` = the letter's patron, no `holderName`, no `guestRegistrationId` - exactly a member's own records | One open bill a day in their own name. |
| The pass of a guest they brought (`accompanying`) | `guest`, with `visit` set | `patronId` = the letter's patron, `holderName` = the guest, `guestRegistrationId` = the guest's pass - exactly a member's guest on a pass | The guest's own open bill of the day, in the visiting member's name. |

- `resolveHolder` reads `patronGroup` before `host`; a visiting pass has no host member and no standing.
- The panel carries `visit { id, visitNo, patronGroup, label, name, memberNo, club { code, name }, ownPassId }`; `host` then names the visiting member with `memberId` and `memberNo` NULL.
- A visiting member's panel lists the guests of the letter for the day (`membershipGateway.listGuestPassesOfVisit`) and has no "Add guest": their guests are registered at the Registration Counter, under the arrangement's guests per visit.
- A guest's panel steps back to the visiting member by `visit.ownPassId` (their own pass of the day), since there is no member number to key.
- No monthly guest allowance is drawn for a visiting member's guest.
- After a return or an undo the panel is redrawn from the letter's own pass of the day (`panelOfRecord`); a return on a day with no pass is taken from the day board, with no panel.

#### The rules, per step

- **7a (BUILT) - utility items.**
  `stationRules.passVerdict` no longer refuses the pass.
  A tile follows `visitingMembersAllowed` ("Not for visiting members."); a guest they brought needs that switch AND `guestsAllowed` ("Not for a visiting member's guests." / "Members only.").
  An item that `requiresEntry` stays closed, because no facility is entered on this pass until 7b.
  Issue fees are flat, so they bill at once without a new price.
  `POST /admissions` refuses a visiting pass in words, and the panel's `entries` is empty.
- **7b (BUILT) - entering a facility.**
  - **The two price groups.**
    `SYSTEM_PARTICIPANT_TYPES` gains `affiliate` (Affiliated Member) and `reciprocal` (Reciprocal Member), seeded lazily like the first three (`ensureSystemTypes` adds what a company is missing).
    Their codes equal Membership's patron groups, so the station prices a visiting member by the group on the pass.
    Their base identities are `systemOnly`: a club prices them and cannot define a type of its own on them (`participantType.controller` refuses, the form does not offer them).
    They are price groups only - not offered on a booking's roster (`booking.controller` meta and `resolveRoster`) nor as a guest line at the desk (`station.controller` meta now offers guest-like types only).
  - **The entry fee.**
    `entryFeeTypeOf`: the type's explicit entry fee item, else the default facility-fee item of the visiting member's participant type, else the members' default item - priced at the visiting member's OWN cell of its rate card.
    No cell is no price: the tile closes with "<CODE> has no price today." and the tap is refused, never the member price and never a silent zero.
    A type with no fee item is free for them as for a member.
  - **The switch.**
    `FacilityType.visitingMembersAllowed` OFF closes the tile with "<CODE> is not open to visiting members." (their guest: "... to a visiting member's guests."), ahead of the hours.
    It is always in force, whatever the Specification's guest control says.
  - **The visiting member's entry.**
    `POST /admissions` on their own pass opens an entry in their own name (`Registration.patronId` = the letter's patron, `hostPresent` true), the fee on the entry's bill, which is their ONE open bill of the day (a paid utility item joins it).
    An entry type that admits only members holding a booking refuses them in the same words as a member without one.
  - **The guest they brought.**
    A line on the visiting member's live entry, on the guest's own pass, by the type's visitor-guest rule (`resolveGuestRule`) and cap (`maxGuestsPerBooking`), with the guest fee on that entry's bill.
    The guest enters ONLY once the visiting member is inside, whatever the type's "host must be present" says of a member's guests ("<visiting member> must enter <CODE> first.").
    No visit is drawn on any member's monthly allowance.
  - **The desk.**
    An item that `requiresEntry` now opens to a visiting member (and their guest) who is inside.
    The day board tags the entry "(reciprocal member)" / "(affiliated member)" and offers no "Guests" editing on it: `replaceGuests` refuses with "... is a visiting member - their guests are registered at the Registration Counter and enter on their own pass."
    Sign-out lists what the party still holds, as for a member.
- **7c - settlement and the letter.**
  The member tender is refused on a visiting member's bill (already true: it needs a member patron); the debtor tender (charge to home club) only where the arrangement's `allowChargeToHomeClub` is ON; a first `platform/facilityGateway.js` so a letter does not complete while an item is out or a facility bill is open, and the counter does not cancel a day used at the station.

#### Web (7b)

- Facility Types: an entry type's form has a "Visiting members" section with the "Visiting members allowed" switch and its (i); a card says "No visiting members" when it is OFF.
- Participant Types: the two system rows are listed with their own base label; the Base Identity select of a club-defined type does not offer them.
- Transaction Types: the rate-card cell picker and the default-category picker list the two groups like any participant type, which is how a club prices them.
- Control Station: the "Enter a facility" tiles show on a visiting member's panel, priced in their own name, and on their guest's panel "on <visiting member>'s bill"; "Sign out with N guests" on the visiting member's own tile.

#### Verified (7b)

- API unit tests 315, web unit tests 437, production web build clean.
- A 46-check run of the station services on a throwaway Postgres: the seeded price groups, the reciprocal price against the member price, a missing affiliated price and its later arrival, the switch, the guest waiting for the visiting member, the cap and the club's guest rule, one open bill, the day board, sign-out, the pickers, and the members of the club unchanged.
- Committed locally; NOT pushed, not seen in a browser.
- After deploy: a club that charges an entry fee adds the Affiliated Member and Reciprocal Member prices to that fee item's price card, or those members stay out of that facility with "has no price today".

#### Web (7a)

- Utility Items: the "Visiting members may take it" switch; "Due back after (days)" is gone and the limit's hint says the item is due back the same day; a card says "Not for visiting members" when the switch is OFF.
- Control Station: the who-line reads "Reciprocal member of <club> (<their number>) · pass <no> · valid today" with the patron group as the chip; a guest's line reads "Guest of <visiting member> (<club>)"; the day board tags what a visiting member holds "(reciprocal member)" / "(affiliated member)"; every "due back in N days" wording is "the same day".

#### Verified (7a)

- API unit tests 310, web unit tests 428, production web build clean.
- A 46-check run of the station services on a throwaway Postgres: both patron groups, the guest they brought, the switches, the bill, undo, return, yesterday's unreturned locker, yesterday's pass refused, and the members of the club unchanged.
- The boot step dropped `dueDays` on a throwaway database booted with the real `server.js`.
- Pushed and deployed to dev 2026-11-14 (pipeline run 43591921906 green).

#### Smoked on dev (7a, 2026-11-14, Tropicana, the user's Chrome)

- Utility Items: the form shows "Visiting members may take it" (ON on the three existing items) and no "Due back after (days)"; the cards read "Due back: Same day".
- The pass GR00007 of the reciprocal visitor (letter L261100004, club SAUJANA) opened the panel in their own name: "Reciprocal member of Saujana Golf & Country Club (SAU-E2E-1) · pass GR00007 · valid today", chip "Reciprocal member", the guest E2E Companion listed, no "Add guest", no "Enter a facility".
- Locker L002 issued (bill FBL-00017 opened in the visitor's name, 5.00, due 23:59 the same day), the tile then closed at the limit; a towel issued and undone; the locker returned from the panel, which stayed the visitor's.
- The guest's pass GR00008 from the guests list: "Guest of E2E Visitor (Saujana Golf & Country Club)", the locker price "on E2E Visitor's bill", a towel issued; "Serve E2E Visitor" stepped back, and the visitor's panel then read "E2E Companion - holding 1".
- The day board tags the rows "(reciprocal member)"; member MEM26-000001 still opens as a member with "Add guest" and the GYM tile.
- Kept on dev: bill FBL-00017 open (5.00), the companion's towel out.
- NOT exercised on dev: an item with the switch OFF (no dev setting was changed), an affiliated (not reciprocal) pass, yesterday's unreturned locker on a new day's pass.
- Polish from the smoke, committed locally: the bill drawer's column headings sat one column to the right of their values (the heading row's last grid track was `auto`, so 0 wide; now a fixed 44px track on both rows); the Utility Items form's "Limit per person" no longer sits alone on its row.

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

- Valid JWT + active company subscribed to the module with code `FACILITY`; per-screen `requireMenuAction`; `canModifyRecord` on update and delete paths; the three ownership stamps on every table.
- The masters (facility types, facilities, venues, instructors, closure plans) enforce the data scope too: update and delete answer 403 outside the caller's scope, and each listing carries a per-row `canModify` so the screen hides the row actions.
  Saving a closure plan's days is amending the plan.
  A slot set is part of its facility type's definition, so creating, editing, re-slotting or deleting one is checked against the TYPE row, whoever created the set.

## Migration status

- [x] Slice 1 models · [x] Slice 1 routes / controllers / screens (2026-10-25, smoked on dev) · [x] Slice 2a masters + Membership additions (2026-10-25, smoked on dev) · [x] Slice 2b booking (2026-10-25, smoked on dev) · [x] Slice 2c billing (2026-10-25, smoked on dev 2026-10-26) · [x] Slice 3 Control Station (2026-10-26, smoked on dev) · [x] Slice 4 No show (2026-10-26, smoked on dev) · [x] Slice 5a venues, instructors, classes, schedules, grid blocking (2026-10-26, smoked on dev) · [x] Slice 5b enrolment, billing, attendance, Hold, station view (2026-10-26, smoked on dev) · [x] Slice 5c waitlist, cancellations, emails (2026-10-26, smoked on dev) · [x] Slice 6a Utility Items master, the issue mode retired (2026-11-11, smoked on dev 2026-11-12) · [x] Slice 6b scan and serve (2026-11-12, smoked on dev) · [x] Slice 6c the guest without a pass, with the member (2026-11-12, smoked on dev) · [x] Slice 6d entering a facility from the panel (2026-11-12, smoked on dev 12 and 13 Nov) · [x] Slice 7a visiting affiliated and reciprocal members: utility items on the day pass, due-days setting dropped (2026-11-14, local only) · [x] Slice 7b visiting members entering a facility on the pass: the type switch, the two price groups (2026-11-14, local only) · [ ] Slice 7c settlement and the letter's completion hold · [ ] Events · [ ] Own DB · [ ] Own deploy
