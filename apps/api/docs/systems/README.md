# Systems Catalog

This folder is the **service map** for the platform.
Each file is the living spec ("skill doc") for one service - the start of a strangler-fig split of the `platform-api` modular monolith into independently deployable microservices.
Every doc is kept in step with the code under `src/`; the model files, route files, `wiring/associations.js`, the `platform/*Gateway.js` seams and the controllers are the source of truth.

## The two tiers

**Platform tier** - cross-cutting; every product depends on it.
Owns identity, tenancy, RBAC, subscriptions, provisioning, notifications.

| Service | Module folder | Owns | Doc |
| --- | --- | --- | --- |
| Identity / Auth | `src/modules/identity` | `User`, `RefreshToken`, `TrustedDevice`; mints the JWT | [identity-auth.md](identity-auth.md) |
| System Administration (Control Plane) | `src/modules/saas` | `Account, Company, CompanyUser, CompanyModule, CompanySmtpConfig, Module, Menu, Role, RoleMenu, Invitation, RegistrationLead, UserFavorite, PlatformProfile`; platform reference data (`Country, Currency, Language, AccountCurrency, AccountLanguage`, the seven `EInvoice*` LHDN tables); subscriber-owned reference data (`IndustryType, Salutation, Nationality, Race, Title, PublicHoliday, Department, Position`); company setup (`CompanyWeekendDay`) | [system-administration.md](system-administration.md) |
| Notification | `src/modules/notification` | Outbox -> email (templated, per-company SMTP) + in-app `Notification` bell; Pub/Sub is a future transport | [notification.md](notification.md) |

**Product tier** - the core systems a club actually uses.
Each becomes its own service + its own database.

| Service | Module folder | Gateway base | Doc |
| --- | --- | --- | --- |
| Membership Management | `src/modules/membership` | `/api/membership` | [membership-management.md](membership-management.md) |
| Golf Management | `src/modules/golf` | `/api/golf` | [golf-management.md](golf-management.md) |
| Facility Management | `src/modules/facility` | `/api/facility` | [facility-management.md](facility-management.md) |
| Account Receivable | `src/modules/ar` | `/api/ar` | [account-receivable.md](account-receivable.md) |

**Shared capability tier** - owned by no single product, consumed by several.
Its own schema + gateway, so it splits out like any service.

| Service | Module folder | Gateway base | Doc |
| --- | --- | --- | --- |
| Tax | `src/modules/tax` | `/api/tax` | [tax.md](tax.md) |
| Dimension | `src/modules/dimension` | `/api/dimension` | [dimension.md](dimension.md) |
| Workflow | `src/modules/workflow` | `/api/workflow` | [workflow.md](workflow.md) |

Tax is consumed by Membership, Golf, AR and the Platform Profile through the `platform/taxGateway.js` seam (never a direct `require()`), and owns the `tax` Postgres schema.
Dimension (financial-analysis dimensions, promoted 2026-08-25) is consumed by AR today (AP / GL / PO later) through `platform/dimensionGateway.js`, and owns the `dimension` schema.
Workflow (user-defined approval chains) is consumed by AR and Golf through `platform/workflowGateway.js` plus the completion handlers in `src/wiring/workflowHandlers.js`, and owns the `workflow` schema.

**Cross-cutting infrastructure** that is nobody's service: the append-only audit trail (`audit.AuditLog`, written only by the global Sequelize hooks in `platform/auditHooks.js`, read by `/api/admin/audit-log` and the tenant audit view) and the transactional outbox (`public.OutboxMessage`).

| Schema | Owner | Notes |
| --- | --- | --- |
| `public` | Identity, Control Plane, Notification, outbox | The shared core; moves to its own schema when those split. |
| `membership`, `golf`, `facility`, `ar` | the product services | One schema per product, created before sync by `platform/schemas.js`. |
| `tax`, `dimension`, `workflow` | the shared capabilities | Same mechanism. |
| `audit` | the global audit hooks | Append-only; retention managed independently of business data. |

Overall architecture, conventions and the migration plan: **[saas-platform.md](saas-platform.md)**.

## Golden rules (so we don't have to revisit when services split)

1. **One owner per table.**
   A service is the single source of truth for its data.
   Nobody else writes it, and nobody else defines a DB-level foreign key into it.
2. **Reference other services' data by UUID only** - no cross-service Sequelize association/FK.
   (e.g. Golf stores `memberId` as a plain UUID, it does not `belongsTo` the Membership `Member` model.)
3. **Identity comes from the JWT, entitlements + RBAC from the Control Plane.**
   A service never re-implements auth or RBAC.
   It verifies the JWT (public key) for *who*, and asks the Control Plane - always through `platform/serviceContext.js` - for the three authorization questions:
   *is the company entitled* (`requireModule('<Module.code>')` - keyed by the frozen `Module.code` such as `AR`, `MEMBERSHIP`, `GOLF`, `FACILITY`, `TENANT_ADMIN`, `PLATFORM_ADMIN`, never by display name),
   *may this role perform the action on this screen* (`requireMenuAction` - role->menu grants with Create/Edit/Delete flags; `requireAnyMenuAction` for endpoints shared by several screens),
   and *whose records may they amend* (`canModifyRecord` / `annotateCanModify` - the role's data scope own/department/all against the record's `createdBy` + department stamps, department = same department and strictly senior by `Position.rank`).
4. **Cross-service calls go through the seam, never `require()` across modules.**
   Synchronous reads go through the in-process `platform/*Gateway.js` seams (`membershipGateway`, `arGateway`, `taxGateway`, `dimensionGateway`, `numberingGateway`, `identityGateway`, `notificationGateway`, `calendarGateway`, `workflowGateway`) and the Control-Plane helpers in `platform/serviceContext.js`.
   Each gateway documents the HTTP call it becomes when its service splits (`internalServiceUrl('<service>')` returns the peer URL, `null` = in-process today).
   Writes / fan-out travel as events via the transactional **outbox**, not direct calls.
5. **Each `app.use('/api/<x>', ...)` is the gateway seam.**
   A service can later be deployed separately and the route re-pointed without touching callers; the Angular app keeps a single `environment.apiUrl` (the gateway).
6. **Every route that reads a request part mounts `validate()`** (`platform/validate.js`, the Zod boundary seam) with a schema from the `*.schemas.js` file beside its controller.
   The rollout is complete (2026-10-12): the product modules, the control plane, the shared numbering router and the notification routes all mount it; the only bare routes read no request part or take a multipart upload bounded by multer.
