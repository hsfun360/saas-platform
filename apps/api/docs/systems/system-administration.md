# System Administration / Control Plane

> Status: LIVE (in monolith as `src/modules/saas`). Tier: **Platform**.
> This is the "System Setup / Administration" you see in the UI - and yes, it is a
> service in its own right, distinct from the core product systems.

## Purpose
The control plane for the whole SaaS: tenancy, RBAC, subscriptions, provisioning.
It answers "*which company, which user, which role, which modules, what permitted*"
for every other service.

## Owns (data)
`Account`, `Company`, `CompanyUser` (membership + role assignment), `Module`,
`Menu`, `CompanyModule` (subscriptions), `Role`, `RoleMenu` (permissions),
`Invitation`, `RegistrationLead`.

**Subscriber-owned shared reference data** (one list per Account, maintained by the
Tenant Admin, consumed by the product systems by value reference - never a
cross-service FK): `IndustryType`, `Salutation`, `Nationality`.
Each follows the same shape: unique `(accountId, code)`, enable/disable via
`isActive` (no hard delete), maintenance under `/api/auth/account/<name>` +
a System Setup screen (`/admin/<name>`), and an active-only consumer list at
`GET /api/<name>` for any workspace user's pickers.
(Promoted out of the Membership master files - see
[membership-management.md](membership-management.md) #4-#6. Note: `Nationality`
is deliberately NOT linked to `Country` - residence is not nationality.)

## Public API (gateway seam: `/api/admin` + tenant routes under `/api/auth/company/*`)
- Provision subscribers (Account + Company + owner User), list subscribers.
- Modules & Menus maintenance (the product catalog every core system registers in).
- Roles + role↔menu permissions; tenant user management; collaborator invitations;
  company profile + module subscriptions.

## Provides to other services (the entitlement contract)
- **Module subscription check** - "is company X subscribed to module Y?" Backs
  `requireModule()` in `platform/serviceContext.js`. When split, expose this as e.g.
  `GET /api/admin/entitlements?companyId=&module=` (or a signed claim).
- **Context** - a company's roles, a user's permitted menus, account ownership.

## Depends on
- Identity: `userId` references (soft UUID once split); verifies its JWT.
- Notification (outbox): CollaboratorInvited, etc.

## Consumed by
- Every product service (entitlement + role/permission checks).
- The Angular admin UI (SaaS Administration, Companies, Role/User Management).

## Migration status
- [x] Module folder · [ ] Entitlements HTTP API · [ ] Own DB · [ ] Own deploy
