# Identity / Auth Service

> Status: LIVE (in monolith as `src/modules/identity`).
> Target: first service to be extracted.
> Tier: **Platform**.

## Purpose

Authenticates users and mints the platform JWT.
Source of truth for *who a user is*.

## Security hardening

The full catalogue of anti-hacking / anti-spam measures on the Login, Forgot/Reset Password and Registration flows (rate limits, backoff, MFA, refresh sessions, trusted devices, hashed one-time tokens, HIBP, disposable-email blocklist, cleanup utility, and what is deliberately parked) lives in [../security-hardening.md](../security-hardening.md).

## Owns (data)

All three tables live in `public`; `userId` / `companyId` on the session tables are plain value references (no FK).

- `User` - `email` (unique), `password` (bcrypt hash; NULL for SSO users), `authMethod` (local / google / microsoft), `full_name`, `phone`, `bio`, `profilePicture`, `isVerified` + `verificationToken`, `resetPasswordToken` (SHA-256 of the emailed value) + `resetPasswordExpires`, `googleId`, `microsoftId`, `lastWorkspaceId` (a companyId or the `SYSTEM` sentinel), `preferredLanguage`, `failedLoginCount` + `lastFailedLoginAt` (capped backoff), `mfaSecret` (AES-256-GCM under `MFA_ENCRYPTION_KEY`), `mfaEnabled`, `mfaEnrolledAt`, `mfaRecoveryCodes` (hashed, JSONB).
- `RefreshToken` - the server-side session behind the httpOnly `rt` cookie: `userId`, `tokenHash` (SHA-256, unique), `familyId` (one login = one family; refresh rotates within it), `companyId` (the workspace the session is scoped to; NULL = System Administration), `expiresAt`, `rotatedAt`, `revokedAt`, `userAgent`, `ip`.
- `TrustedDevice` - one row per browser that proved MFA and asked not to be challenged again: `userId`, `tokenHash` (SHA-256 of the httpOnly `td` cookie, unique), `expiresAt` (issued + 30 days, never extended by use), `revokedAt`, `lastUsedAt`, `userAgent`, `ip`.
- Rule: other services reference a user by **`userId` (UUID) only**.
  The one sanctioned write seam for a peer service is `platform/identityGateway.js`: `provisionPortalUser({ email, fullName, password })` (find-or-create a verified local user for the member portal registration, never touching an existing account's password) and `issueLoginToken(userId, email)` (a 24h session token with null company claims).

## Tokens (minted here only)

- **Access token**: RS256, private key from `platform/jwt.keys.js`, `expiresIn: '1h'`.
  Claims: `id, email, companyId, companyName, isSystemAdmin, rememberMe`.
  Everyone else verifies with the **public key** (`platform/auth.middleware.js`); future: expose JWKS.
- **Refresh session** (`session.service.js`): the httpOnly `rt` cookie (secure, `SameSite` from `COOKIE_SAMESITE`, default `none`; path-scoped to `/api/auth`) whose SHA-256 is a `RefreshToken` row.
  24 hours normally, 30 days with "Keep me signed in"; rotation never extends the family's original horizon; replaying a rotated-out token revokes the whole family; sign-out, password change and password reset revoke server-side.
  `POST /refresh` re-issues a 1h access token for the SAME workspace with the same `rememberMe` horizon.
- **Purpose-scoped tokens** (rejected by every normal endpoint because they carry a `purpose` claim): `onboarding` (1h, a verified user with no workspace yet; valid only on `/onboarding/*`), `mfa` (10 minutes, the step-up between password and code), `mfa-enroll` (forced enrollment for admin roles; valid on `/mfa/setup` + `/mfa/enable`).
- **Portal token**: `identityGateway.issueLoginToken` mints a 24h session token for a member who just registered through the portal; the agent portal uses the same shape.

## Public API (gateway seam: `/api/auth`)

Every public endpoint mounts a per-IP rate-limiter factory from `platform/rateLimits.js` and a `validate()` schema from `auth.schemas.js`.

- Register / verify: `POST /register-user`, `GET /verify/:token`, `POST /verify-email`, `POST /register-lead`, `POST /activate`.
- Login + SSO: `POST /login`, `GET /sso-config`, `POST /google`, `POST /google/exchange`, `POST /microsoft-login`.
- Password: `POST /forgot-password`, `POST /reset-password`, `POST /change-password` (session).
- MFA: `POST /mfa/verify` (the `mfa` token + code), `POST /mfa/setup`, `POST /mfa/enable` (session or `mfa-enroll` token), `GET /mfa/status` (adds `required` + `requiredBy` role|organisation), `POST /mfa/disable` (refused while required).
  The forced-enrolment gate in `completeLogin` (`mfaEnrollRequired` + `mfaEnrollReason`) covers administrator roles AND every user of an account whose MFA policy is in force (`saas/securityPolicy.service.js`, 2026-10-30); the code challenge is skipped on a workspace switch, the enrolment gate never is.
- Sessions: `POST /refresh`, `POST /logout`.
- Onboarding (the `onboarding` token): `GET /onboarding/modules`, `POST /onboarding/provision` (one `provisionTenant()` path shared with the platform's subscriber creation).
- Profile: `GET /profile`, `PUT /profile` (queues the `profile.updated` security alert), `POST /upload-avatar`.
- Workspaces: `GET /workspaces`, `POST /switch-workspace` (re-mints a JWT scoped to the chosen company and re-issues the refresh session).
- `GET /me/language` · `PATCH /me/language` - the user's preferred UI language within the active account's set.

The same router also HOSTS around 80 control-plane routes that delegate into the `saas` module and move with the Control Plane when it splits: the Tenant Admin surface under `/company/*` (roles, users, MFA reset, assign-role, revoke, collaborators, invitations, available-modules, logo), `/companies[/:companyId/...]` (create/update, modules, SMTP, weekend days), `/account/*` (users, audit log, menus, roles, languages, currencies, industry types, salutations, nationalities, races, titles, departments, positions, public holidays, email-template overrides), the invitee side `/invitations[/:id/accept|decline]`, and the self-service `/my/favorites`.
Those routes are gated by the router's own `authenticateToken` + `requireTenant` + `requireMenuAction('<System Setup menu>')` stack (since 2026-10-12; the 'Tenant Admin' role keeps implicit full access inside `requireMenuAction`, and a target company other than the active one still needs `canAdministerCompany` in `saas/tenant.js`), and every one that reads a request part mounts `validate()` with a schema beside its controller; see [system-administration.md](system-administration.md) for what they do.

## Login menus payload (RBAC surface for the frontend)

- Login/switch-workspace resolves the user's effective menus: role's granted menus intersected with the active company's entitled menus, plus the ancestor grouping sections of any grant (`withAncestors` - grants store LEAF menus only).
  The "Tenant Admin" role gets implicit full access to all entitled menus.
- Each menu ships `actions: { create, edit, delete }` from its `RoleMenu` grant flags (all-true for Tenant Admin / full-access paths; all-false on grouping sections), which the frontend's `PermissionsService` / `*appCan` use to hide action buttons.
  UX only - the authoritative checks are `requireMenuAction` + the data-scope helpers in `platform/serviceContext.js` (see [system-administration.md](system-administration.md)).
- Login branches after auth: staff memberships (CompanyUser) land in the admin shell; a user with no workspace gets the `onboarding` token; members and sales agents linked by `Member.userId` / `SalesAgent.userId` use the `/portal` and `/agent` surfaces, whose endpoints carry `verifyToken` only (no member-context guard exists today - see membership-management.md).

## Depends on

- Notification (outbox): every email is a templated `EmailQueued` message rendered at enqueue - `user.activation` (register), `account.activation` (lead activation), `password.reset`, `password.reset.sso` (an SSO account asking for a reset gets guidance by email instead of an enumeration hint), `password.reset.success`, `profile.updated`.
  The security emails resolve their brand scope from the identity (`platform/identityScope.resolveIdentityScope`) and always deliver through the platform mailer (`forcePlatformSender`).
  Google and Microsoft sign-ups additionally write a `UserRegistered` outbox event, which the worker skips (already verified) - a legacy type kept alive only by that path.
- Control Plane (today via in-process require for workspace/role resolution at login) - becomes a service call / token claim when split.
- Schema sync: the identity tables apply through the fingerprint-gated boot sync like every other model.

## Consumed by

- Every service (indirectly) - they verify the JWT it mints.
- Membership (member portal + sales-agent portal) through `platform/identityGateway.js`; the Workflow engine and the notification gateway read `User` for names and addresses (lazy requires, read-only).

## Migration status

- [x] Module folder · [x] Session + trusted-device tables · [ ] Cut User<->Company FK to soft UUID · [ ] JWKS · [ ] Own DB · [ ] Own deploy
