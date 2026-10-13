# Facility Management

> Status: PLANNED (stub at `src/modules/facility`, gateway seam `/api/facility` reserved).
> Tier: **Product (core system)**.
> Fill in as it is built.

## Purpose

Manage bookable club facilities and resources: venues/rooms/courts, availability calendars, reservations, booking rules, utilisation, maintenance windows.

## Owns (data) - fill in

- e.g. `Facility`, `Resource`, `Availability`, `Reservation`, `BookingRule`.
- Tables will live in the `facility` Postgres schema (`FACILITY_SCHEMA` is declared in `platform/schemas.js`; it is not yet in `PRODUCT_SCHEMAS` because no model exists).
- References `companyId` and `memberId` by **UUID only**.

## Public API (gateway seam: `/api/facility`) - fill in

- Today: `GET /health` returns `{ service: 'facility', status: 'stub' }`; everything else answers `501 { message: 'Facility Management is not implemented yet.' }` behind `verifyToken` + `requireModule('FACILITY')`.
- Planned: `GET /facilities`, `/facilities/:id/availability`, `POST /reservations`, `/booking-rules`.
- (The dev seed reserves "Facilities Setup" `/facilities` and "Booking Rule Setup" `/booking-rules` menus under the Core module.)
- Every route that reads a request part must mount `validate()` with a `*.schemas.js` file beside its controller, and every screen's sub-router must mount `requireMenuAction('<screen route>')` on top of the module gate.

## Depends on

- Identity (JWT verify) and Control Plane (`requireModule('FACILITY')` - the frozen `Module.code`, never the display name "Facility Management"; roles).
- **Membership** - validate a member / entitlement to book through `platform/membershipGateway.js` (in-process today, an internal HTTP read when split), never shared tables.
- **Calendar** - weekday/weekend classification through `platform/calendarGateway.js` (public holidays count as weekend).
- **Tax** - price quotes through `platform/taxGateway.js`.
- **AR** - charge-to-account through `platform/arGateway.js` (`postCharge` is already opened to the `facility` source module and the Transaction Type catalog's `usableInModules` accepts `facility`).
- Notification (outbox): templated `EmailQueued` emails like the golf booking emails; no facility event types exist yet.

## Consumed by

- Reporting/analytics; possibly Golf (shared resource calendars) - via API/events.

## Auth & entitlements

- Valid JWT + active company subscribed to the module with code `FACILITY`.

## Migration status

- [ ] Models · [ ] Routes/controllers · [ ] Events · [ ] Own DB · [ ] Own deploy
