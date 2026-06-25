# Facility Management

> Status: PLANNED (stub at `src/modules/facility`, gateway seam `/api/facility`
> reserved). Tier: **Product (core system)**. Fill in as it is built.

## Purpose
Manage bookable club facilities and resources: venues/rooms/courts, availability
calendars, reservations, booking rules, utilisation, maintenance windows.

## Owns (data) — fill in
- e.g. `Facility`, `Resource`, `Availability`, `Reservation`, `BookingRule`…
- References `companyId` and `memberId` by **UUID only**.

## Public API (gateway seam: `/api/facility`) — fill in
- e.g. `GET /facilities`, `/facilities/:id/availability`, `POST /reservations`,
  `/booking-rules`…
- (Seed already reserves "Facilities Setup" `/facilities` and "Booking Rule Setup"
  `/booking-rules` menus.)

## Depends on
- Identity (JWT verify) · Control Plane (`requireModule('Facility Management')`, roles).
- **Membership** — validate a member / entitlement to book, via
  `internalServiceUrl('membership')` (HTTP), never shared tables.
- Notification (outbox): `ReservationCreated`, `ReservationCancelled`.

## Consumed by
- Reporting/analytics; possibly Golf (shared resource calendars) — via API/events.

## Auth & entitlements
- Valid JWT + active company subscribed to the **Facility Management** module.

## Migration status
- [ ] Models · [ ] Routes/controllers · [ ] Events · [ ] Own DB · [ ] Own deploy
