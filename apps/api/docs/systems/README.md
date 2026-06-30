# Systems Catalog

This folder is the **service map** for the platform. Each file is the living spec
("skill doc") for one service - start of a strangler-fig split of the LoginAPI
modular monolith into independently deployable microservices. Fill in details as
each service is built.

## The two tiers

**Platform tier** - cross-cutting; every product depends on it. Owns identity,
tenancy, RBAC, subscriptions, provisioning, notifications.

| Service | Module folder | Owns | Doc |
| --- | --- | --- | --- |
| Identity / Auth | `src/modules/identity` | `User`; mints the JWT | [identity-auth.md](identity-auth.md) |
| System Administration (Control Plane) | `src/modules/saas` | `Account, Company, CompanyUser, Module, Menu, CompanyModule, Role, RoleMenu, Invitation, RegistrationLead` | [system-administration.md](system-administration.md) |
| Notification | `src/modules/notification` | Outbox → email / Pub/Sub | [notification.md](notification.md) |

**Product tier** - the core systems a club actually uses. Each becomes its own
service + its own database.

| Service | Module folder | Gateway base | Doc |
| --- | --- | --- | --- |
| Membership Management | `src/modules/membership` | `/api/membership` | [membership-management.md](membership-management.md) |
| Golf Management | `src/modules/golf` | `/api/golf` | [golf-management.md](golf-management.md) |
| Facility Management | `src/modules/facility` | `/api/facility` | [facility-management.md](facility-management.md) |

Overall architecture, conventions and the migration plan: **[saas-platform.md](saas-platform.md)**.

## Golden rules (so we don't have to revisit when services split)

1. **One owner per table.** A service is the single source of truth for its data.
   Nobody else writes it, and nobody else defines a DB-level foreign key into it.
2. **Reference other services' data by UUID only** - no cross-service Sequelize
   association/FK. (e.g. Golf stores `memberId` as a plain UUID, it does not
   `belongsTo` the Membership `Member` model.)
3. **Identity comes from the JWT, entitlements from the Control Plane.** A service
   never re-implements auth or RBAC. It verifies the JWT (public key) for *who*,
   and asks the Control Plane for *what they're allowed to* (module subscription,
   role permissions). Both go through `platform/serviceContext.js`.
4. **Cross-service calls go through the seam, never `require()` across modules.**
   Synchronous reads → the control-plane/peer HTTP API (`internalServiceUrl()`).
   Writes / fan-out → events via the transactional **outbox**, not direct calls.
5. **Each `app.use('/api/<x>', ...)` is the gateway seam.** A service can later be
   deployed separately and the route re-pointed without touching callers; the
   Angular app keeps a single `environment.apiUrl` (the gateway).
