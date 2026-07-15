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
- Planned next (per spec): tee-sheet generation (2.2.10/2.2.11), closure plans, handicap control, min players, penalties, player types.
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
