# Membership Management

> Status: PLANNED (stub at `src/modules/membership`, gateway seam `/api/membership`
> reserved). Tier: **Product (core system)**. Fill in as it is built.

## Purpose
Manage club members: member records, categories/tiers, dues/billing, status
(active/suspended/expired), dependents, cards. Likely the **identity anchor for the
other product systems** - Golf and Facility reference a member.

## Owns (data) - fill in
- e.g. `Member`, `MembershipTier`, `MemberDependent`, `MembershipBilling`…
- References `userId` and `companyId` by **UUID only** (no FK into Identity/Control
  Plane). A member may or may not map to a login `User`.

## Public API (gateway seam: `/api/membership`) - fill in
- e.g. `GET/POST /members`, `/members/:id`, `/tiers`, `/members/:id/billing`…

## Depends on
- Identity (JWT verify) · Control Plane (`requireModule('Membership Management')`,
  roles/permissions).
- Notification (outbox): `MemberCreated`, `MembershipRenewed`, `MembershipExpired`.

## Consumed by
- **Golf** and **Facility** (resolve/validate a member, check standing) - via this
  service's HTTP API (`internalServiceUrl('membership')`), not shared tables.

## Auth & entitlements
- Valid JWT + active company subscribed to the **Membership Management** module.

## Migration status
- [ ] Models · [ ] Routes/controllers · [ ] Events · [ ] Own DB · [ ] Own deploy
