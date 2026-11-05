# Access Control Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually |
| Status | Active |

## 1. Identity and authentication

- Every user has an individual account (`public."User"`); shared accounts are not permitted.
- Supported sign-in methods: local email/password, Google SSO, and Microsoft SSO.
- Passwords are stored only as salted hashes (bcrypt); plaintext passwords are never stored or logged.
- Password floor is 8 characters at every point a password is set (register, reset, change, activate, portal registration).
- Passwords known from public breaches are rejected at all password-set points via the HIBP k-anonymity API (fail-open with a 2.5 s timeout so availability is never held hostage).
- Disposable/temporary email domains are rejected at registration (bundled blocklist, no runtime network call).
- Email addresses must be verified before an account can be used.

## 2. Session management

- Sessions use RS256-signed JWTs with a 1 hour lifetime, refreshed via httpOnly rotating refresh-token cookies.
- Refresh tokens are stored hashed, rotate on every use, and a replayed token revokes its whole family.
- Session horizon is 24 hours by default and 7 days maximum with "remember me" (a deliberate ceiling).
- Logout, password change, and password reset revoke the user's refresh tokens.
- Every request checks that the session behind the access token is still live, so a revoked session is signed out at its next request (control added 2026-11-05).
- **Concurrent sessions are limited per subscriber** (control added 2026-11-05): by default a user may be signed in on one device at a time within the subscriber's companies; a new sign-in ends the idlest existing session, the affected user is notified in-app and by email naming both devices, and the sign-in is logged.
  The Tenant Admin may raise the limit to at most 10 devices or switch it off, and may exempt specific roles; the Tenant Admin role itself is never exempt.
  Users can review and end their own sessions under Profile, Security.
- Signing keys are RS256 key pairs held in Google Secret Manager, never in the container image.

## 3. Multi-factor authentication

- TOTP MFA is available to all users (self-service enrollment under Profile, Security).
- MFA is **mandatory** for privileged roles (System Admin and Tenant Admin); self-disable is refused for them and enrollment is forced at login.
- A subscriber may extend that requirement to **every user of its account** (tenant-level MFA policy, optionally from a start date, set by its Tenant Admin under System Setup, Security Policy); enforcement is the same forced enrolment at sign-in and self-disable refusal (control added 2026-10-30).
- "Remember this device" (trusted devices) skips only the second factor, never the password: the trust is a hashed httpOnly cookie bound to one user, bounded in time (platform default 30 days, never extended by use), revoked server-side on MFA disable, MFA reset, password change and password reset, and visible to and revocable by the user under Profile, Security (control added 2026-11-01).
- A subscriber may switch trusted devices off for its account or shorten the window (1 to 90 days) under System Setup, Security Policy; the rule in force applies at every sign-in, including to devices trusted earlier (control added 2026-11-01).
- Shared workstations are trusted as a PLACE, never through a person's "remember this device": a subscriber's administrator registers a front-desk browser for the organisation (System Setup, Security Policy, "Register this workstation"); when the subscriber's switch is on, staff roles signing in from that browser skip the second factor only, the password factor and enrolment stay mandatory, privileged roles always confirm a code, registrations expire after one year, are listed and revocable by the administrator, and their registration and revocation are logged (control added 2026-11-01).
- A subscriber may restrict a role to its registered workstations (Role Management, "Sign in only from registered workstations"): holders of that role are refused from any other device before any second factor, the refusal is logged, privileged roles cannot be locked, and the Security Policy screen shows how many roles depend on the stations before one is revoked (control added 2026-11-01).
- Exceptions to that restriction are time-boxed, approved and logged: a locked user asks from the sign-in screen, the approvers (the subscriber's administrators and holders of the Access Requests screen) are notified, approve for a window bounded by a subscriber-set ceiling (at most 90 days), decline, or grant in advance; a grant lifts the location restriction only, never the password or the second factor; grants are listed, revocable and expire on their own, and every request, decision and revocation is recorded (control added 2026-11-01).
- TOTP secrets are stored encrypted (AES, key in Secret Manager); recovery codes are stored hashed.
- MFA reset is a deliberate administrative action (tenant-admin and system-admin endpoints), and is audit-logged.

## 4. Authorization (RBAC)

- Authorization is role-based: roles grant per-menu action flags (view/create/edit/delete) through `RoleMenu`, enforced server-side by the `requireMenuAction` seam - never only in the UI.
- Module entitlements are enforced per company (`requireModule`); a company without a product module cannot reach its endpoints.
- Data scope is enforced per role (own / department / all) against record ownership stamps (`createdBy`, department, position seniority) via the `canModifyRecord` seam.
- New product tables must carry the ownership stamp columns so data-scope enforcement extends automatically.

## 5. Platform vs tenant separation

- Platform (SaaS) administrators manage the subscription contract only: plan, status, entitlements, and platform reference data.
- Platform administrators do not view or edit tenant business data or tenant preferences; the sole exception is Tenant Admin recovery.
- Tenant Admins manage users, roles, and configuration strictly within their own account (tenant); all tenant queries are scoped by `accountId`.

## 6. Privileged and break-glass access

- The break-glass System Admin allowlist is the `ADMIN_EMAILS` environment variable on `platform-api`; changes to it are deployments and therefore leave an audit trail in Cloud Run revision history.
- Direct database access is limited to the platform team via the connection credential in Secret Manager; there is no application path to raw SQL.
- Cloud resources are administered through the Google Cloud project with provider IAM; service accounts run with least privilege (for example, the CI deployer service account can be impersonated only by this repository's GitHub workflows through Workload Identity Federation, with no key file anywhere).

## 7. Joiners, movers, leavers

- Tenant users are provisioned by their Tenant Admin (invitation flow) and deprovisioned by revoking their company membership; revocation takes effect at the next token refresh (within 1 hour).
- Platform-side personnel changes require: removal from `ADMIN_EMAILS` (redeploy), removal from Google Cloud IAM, and rotation of any shared infrastructure credentials they held.
- Stale unverified registrations are reviewed and deleted through the dedicated admin utility (`/admin/unverified-users`), which re-validates server-side that targets are unverified and hold no workspace.

## 8. Abuse resistance

- Every public (unauthenticated) endpoint mounts a per-IP rate limiter from the `rateLimits.js` factories; this is a standing rule for new endpoints.
- Failed local logins back off exponentially to a 15 minute ceiling; permanent lockout is deliberately avoided (lockout is a denial-of-service lever).
- Per-email cooldowns prevent password-reset and activation email flooding, without revealing account existence.
- Responses never reveal whether an email exists (uniform success messages, including for SSO-only accounts).
