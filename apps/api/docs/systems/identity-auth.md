# Identity / Auth Service

> Status: LIVE (in monolith as `src/modules/identity`). Target: first service to
> be extracted. Tier: **Platform**.

## Purpose
Authenticates users and mints the platform JWT. Source of truth for *who a user is*.

## Owns (data)
- `User` (email, password hash, authMethod local/google/microsoft, profile fields,
  verification + reset tokens).
- Rule: other services reference a user by **`userId` (UUID) only**.

## Public API (gateway seam: `/api/auth`)
- Register, login, Google/Microsoft SSO, forgot/reset password, change password.
- Profile read/update, avatar upload.
- Workspace listing + switch (re-mints a JWT scoped to the chosen company).
- (Today also hosts some tenant/invitation routes that delegate into the Control
  Plane - these move with the Control Plane when split.)

## JWT (minted here only)
- RS256, private key from `platform/jwt.keys.js`. Claims: `id, email, companyId,
  companyName, isSystemAdmin`. 24h expiry.
- Everyone else verifies with the **public key**. Future: expose JWKS.

## Depends on
- Notification (async, via outbox): UserRegistered, PasswordResetRequested, etc.
- Control Plane (today via in-process require for workspace/role resolution at
  login) - becomes a service call / token claim when split.

## Consumed by
- Every service (indirectly) - they verify the JWT it mints.

## Migration status
- [x] Module folder · [ ] Cut User↔Company FK to soft UUID · [ ] Own DB · [ ] Own deploy
