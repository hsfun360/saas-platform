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

### Slice 2 - slot Booking with guest control and billing (OUTLINE)

- `facility.Patron` / `facility.OtherPatron` - the thin identity (`patronType` member|other, `sourceId`, name / memberNo snapshots, remarks, isActive; unique (companyId, patronType, sourceId)) and the visitor profile (platform person vocabulary: name, identityNo, gender, birthDate, nationalityCode, mobile, email; dedupe by identityNo / mobile).
  Created lazily at first booking or registration; a visitor who joins is re-pointed to the member keeping the same patronId.
- `facility.PlayerType` - the participant catalog (member / member-guest / guest system rows + club-defined, `baseIdentity`), the key on every participant line and the rate card, exactly `golf.PlayerType`.
- `facility.TransactionType` + `facility.TransactionTypeRate` + `facility.TransactionTypeRateCell` - the billing-item catalog (charge types `facility-fee` / `guest-fee` / `issue-fee` / `class-fee` / `no-show` / `miscellaneous` / `package`, tax scheme by code via the tax seam, allowPriceOverride, icon) with effective-dated rate cards whose cells are rows keyed `(playerType, dayScope, sessionId NULL = any)` so peak / off-peak prices per player type fit without fixed columns; flat charge types keep one `flatAmount`.
- `facility.PaymentType` - the tender catalog, same classes as golf (cash / creditcard / member / debtor / voucher / staff / online / suspend).
- `facility.NumberingScheme` - `facility-booking`, `facility-bill` series (shared `defineNumberingScheme` shape, `/facility/numbering`).
- `facility.Booking` (header: bookingNo, patronId booker, contact, remarks, status booked / cancelled, `workflowInstanceId` for approval-required types) + `facility.BookingSlot` (one row per reserved slot: facilityId, bookingDate, startTime, endTime, slotNumber, sessionId snapshot, dayType snapshot, status; unique (facilityId, bookingDate, startTime) among live rows) + `facility.BookingParticipant` (per slot: patronId or guest name, playerType, isHost, guestVisitId once confirmed).
- `facility.SlotLock` - the claimed slot while a booking is keyed (`bookingLockMinutes`), the golf `FlightLock` pattern.
- `facility.GuestControlRule` - sparse exceptions per type / day scope / time band, most specific wins, PUT-replaced from the Specification.
- `facility.AdvanceBookingOverride` - per-membership-type earlier windows, behind `FacilitySetting.allowMembershipTypeOverride`.
- `facility.Bill` / `BillItem` / `BillPayment` - one bill per booking slot opened at check-in (or at booking for prepaid types), golf's engine copied: package explosion, tax snapshots, member / debtor classes post to AR through `arGateway.postCharge` with credit enforcement.
- Rules enforced in the booking channel: window, same-day, per-type slots per day (`maxSlotsPerDayWeekday/Weekend`, counted as booker or participant), consecutive cap, participants min / max, guest control (type flags, rules, `maxGuestsPerBooking`, the member's monthly allowance via the membership seam), cancellation notice.
- **Membership additions (owned by Membership, consumed through `membershipGateway`):** `MembershipType.monthlyGuestAllowance` (INTEGER, NULL = no limit; the club-wide guests per calendar month; the existing `guestQuota` keeps its golf per-booking meaning and label) and `membership.GuestVisit` (memberId host, visitDate, sourceModule facility|golf, sourceRef UUID, guestName, guestCount, status confirmed / voided; indexed (companyId, memberId, visitDate)).
  Gateway: `getGuestAllowanceStanding(companyId, memberId, date)` -> `{ allowance, used, remaining }` and `recordGuestVisit` / `voidGuestVisit` called inside the producer's transaction; the member's screen shows the month's tally.
- Screens: `/facility/bookings` (grid: facilities of a type across the day's slots, the tee-sheet pattern; drawer to key participants), `/facility/transaction-types`, `/facility/payment-types`, `/facility/player-types`, `/facility/numbering`; Specification gains *Booking limits* and *Guest rules*.

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
