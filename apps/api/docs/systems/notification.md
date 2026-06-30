# Notification Service

> Status: LIVE as a worker (`src/modules/notification/notification.worker.js`,
> entry point `outboxworker.js`). Tier: **Platform**.

## Purpose
Delivers asynchronous messages (email today) reliably, decoupled from request
handling, using the transactional **outbox** pattern.

## How it works
- Producers write a row to `OutboxMessage` (`platform/outboxMessage.model.js`)
  **inside the same DB transaction** as their business write - atomic, no lost events.
- The worker polls PENDING messages every ~5s, sends the email (Nodemailer/Gmail),
  marks COMPLETED/FAILED with retry/backoff (gives up after 5 tries).

## Owns (data)
- `OutboxMessage` processing state. (The table is shared infra today; when services
  split, each service keeps its own outbox and publishes to a broker.)

## Event types (current)
- `UserRegistered`, `PasswordResetRequested`, `CollaboratorInvited`, `ProfileUpdated`.
- Core systems will add their own (e.g. `MemberCreated`, `TeeTimeBooked`).

## Depends on / Consumed by
- Consumes the outbox written by every service. Calls out to email (later: SMS/push).

## Migration target
- Generalize to a **Notification service** backed by **Google Pub/Sub** (fits Cloud
  Run): services publish events; subscribers (notification, analytics, other
  products) react. The outbox becomes the publish step.

## Migration status
- [x] Worker · [ ] Pub/Sub transport · [ ] Per-service outbox · [ ] Own deploy
