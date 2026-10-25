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

Columns added by later slices (declared with that slice, listed here for the whole picture): slice 2 `allowMembershipTypeOverride`, `bookingLimitScope`; slice 4 `lateCancellationAction`, `noShowTransactionTypeId`, `noShowChargeBasis`, `noShowGraceMinutes`, `strikeCount`, `strikeWindowDays`, `strikeSuspensionDays`; slice 5 `classesEnabled`.

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

### Slice 2 - slot Booking with guest control and billing (FULL DETAIL, for approval)

Slice 2 is built in three sub-slices, in this order, all against the structures below: **2a masters** (the identity pair, participant types, the billing catalogs, numbering, the guest and override rules, the two Membership additions), **2b booking** (the grid, the rules, slot locks), **2c billing** (the bill engine on a booking).
Decisions proposed here and open for your change: the participant category table is named *Participant Type* (golf says Player Type); a bill belongs to the whole BOOKING, payable by the booker, not one per slot or per participant; a transaction type carries a *fee basis* (per slot, per participant, per booking) so a court fee and a per-head guest fee price differently; a member's guest visits are recorded in Membership's ledger when the booking is confirmed, voided when it is cancelled, and kept when the guests fail to show.

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

### Slice 3 - Control Station (OUTLINE)

- `facility.Registration` - one row per check-in or walk-in entry: patronId, facilityTypeId, facilityId (NULL for a type-level entry such as the pool), bookingSlotId (NULL = walk-in), registrationNo (`facility-registration` series), timeIn, timeOut, guestCount, status in / out / no-show, billId.
- `facility.IssueRecord` - one row per issue: patronId, facilityTypeId, facilityId (unit, NULL for a counted consumable), quantity, issuedAt, dueBack, returnedAt, condition on return, depositBillId / feeBillId, status issued / returned / lost.
- `Facility.unitStatus` + `currentIssueId` for issue-mode units.
- Station screen `/facility/station`: today's bookings to check in (closes at slot start like the tee sheet's club clock), entry register with the live capacity count per entry type, issue / return board for lockers and towels, guest registration under the guest rules, open issues at end of day.

### Slice 4 - No show (OUTLINE)

- `facility.NoShowCharge` - one row per penalised booking slot (chargeReason no-show / late-cancel, booker patron, transaction type snapshot, tax snapshot, status pending / posted / waived, AR document snapshot), golf's table shape.
- `facility.PatronSuspension` - the strike outcome: patronId, facilityTypeId (NULL = all types), reason, fromDate, toDate, liftedBy / liftedAt; the booking channel refuses a suspended patron with the end date named.
- Specification gains `lateCancellationAction` (charge / refuse), `noShowTransactionTypeId`, `noShowChargeBasis` (booking / slot / participant), `noShowGraceMinutes`, `strikeCount`, `strikeWindowDays`, `strikeSuspensionDays`; Facility Type gains `noShowChargeEnabled` and `noShowStrikeEnabled`.
- The station's no-show review marks a slot after start + grace; the engine raises the charge and counts the strike; `/facility/no-show-charges` lists, posts and waives.

### Slice 5 - Classes (OUTLINE)

- `facility.Instructor` - the instructor master (name, contact, specialities, isActive).
- `facility.Class` - the programme (code, description, facilityTypeId + facilityId where held, instructorId, capacity, fee transaction type, enrolment mode per-session / per-term, requires booking).
- `facility.ClassSchedule` (recurrence header: weekdays, start / end time, dateFrom / dateTo) -> generated `facility.ClassSession` rows (date, times, instructor override, capacity override, status scheduled / held / cancelled); a session occupies the facility's slots and blocks court booking.
- `facility.ClassEnrolment` (patron, session or term, status enrolled / attended / no-show / cancelled, billId) + `facility.ClassWaitlist`.
- Specification gains `classesEnabled`; screens `/facility/classes`, `/facility/instructors`, `/facility/class-schedule`.

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

- [x] Slice 1 models · [x] Slice 1 routes / controllers / screens (2026-10-25, dev smoke pending) · [ ] Slice 2 · [ ] Slice 3 · [ ] Slice 4 · [ ] Slice 5 · [ ] Events · [ ] Own DB · [ ] Own deploy
