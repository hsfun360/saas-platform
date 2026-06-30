# Golf Management

> Status: PLANNED (stub at `src/modules/golf`, gateway seam `/api/golf` reserved).
> Tier: **Product (core system)**. Fill in as it is built.

## Purpose
Golf operations: courses, tee-time scheduling and booking, flights/pairings,
handicaps, competitions, pro-shop/scoring as needed.

## Owns (data) - fill in
- e.g. `Course`, `TeeSheet`, `TeeTime`, `Booking`, `Flight`, `Competition`…
- References `companyId` and `memberId` by **UUID only**.

## Public API (gateway seam: `/api/golf`) - fill in
- e.g. `GET /courses`, `/tee-times?date=`, `POST /bookings`, `/competitions`…
- (Seed already reserves a "Tee Time Setup" menu at `/golf/tee-times`.)

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
- [ ] Models · [ ] Routes/controllers · [ ] Events · [ ] Own DB · [ ] Own deploy
