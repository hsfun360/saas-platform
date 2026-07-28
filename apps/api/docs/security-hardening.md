# Auth Security Hardening Catalogue

The defence measures protecting the Login, Forgot/Reset Password, and Registration pages against hacking, account takeover, enumeration, email flooding, and fake-account spam.
All measures below are BUILT and DEPLOYED (2026-07-24 to 2026-07-27) unless marked as parked.
Implementation lives in `src/modules/identity` (auth.controller.js, mfa.service.js, session.service.js) and `src/platform` (rateLimits.js, passwordBreach.js, disposableEmail.js, secretbox.js).

## Login page (brute force and credential stuffing)

- **Per-IP rate limit**: 20 attempts / 15 min / IP on login and every SSO exchange (`platform/rateLimits.js`, factories so buckets never pool across endpoints; `trust proxy 1` so `req.ip` is the real client behind Cloud Run).
- **Per-account capped exponential backoff**: consecutive failed passwords delay the NEXT attempt (1s -> 5s -> 30s -> 60s -> 300s -> 900s cap), tracked in the DB (`User.failedLoginCount`) so it holds across instances and distributed attacker IPs.
  Deliberately NEVER a permanent lockout - lockout is a denial-of-service lever against legitimate users.
  A successful login resets the counter.
- **No enumeration**: wrong email and wrong password return the identical generic 401.
- **TOTP MFA (two-factor authentication)**: 6-digit authenticator-app code after the password, plus 8 single-use recovery codes (hashed at rest).
  MANDATORY for System Admin and Tenant Admin roles (forced enrollment at login; self-disable refused); opt-in for everyone else via Profile -> Security.
  The TOTP secret is AES-256-GCM encrypted under its own `MFA_ENCRYPTION_KEY`.
  Recovery path: Tenant Admin resets a managed user's MFA; System Admin resets anyone's (never their own).
- **Short access tokens + revocable sessions**: access JWTs live 1 hour; staying signed in is a rotating httpOnly refresh cookie (`RefreshToken` table, hashed, SameSite=None, path-scoped to `/api/auth`).
  "Keep me signed in" = 30 days, otherwise 24 hours.
  Replaying a rotated-out refresh token is treated as theft and revokes the whole session family.
  Sign-out, password change, and password reset revoke sessions server-side.
- **Breached-password screening at login-adjacent points**: passwords are checked against HaveIBeenPwned wherever they are CHOSEN (see Registration below) - deliberately NOT inline at login (latency + availability).
- **Unverified accounts cannot log in** at all ("Please verify your email first").
- **Password-manager friendly**: correct `autocomplete` attributes so users can hold long unique passwords - the users credential stuffing fails against.
- **CORS locked** to the deployed frontend origin + localhost dev (no more `*`).

## Forgot / Reset Password page (enumeration and email flooding)

- **No user enumeration**: unknown email, known email, SSO account, and cooldown repeats all return the byte-identical "If an account exists, a reset link has been sent.".
  An SSO (Google/Microsoft) account gets the guidance BY EMAIL (`password.reset.sso` template) instead of an HTTP hint that would confirm the account exists and name its IdP.
- **Email-flood protection, two independent axes**: per-account cooldown of 1 email / 5 minutes (DB-derived, botnet-proof, also arms on the SSO notice) + per-IP limit of 5 requests / hour.
- **Reset token security**: 32 random bytes, stored as a **SHA-256 hash** (the raw value exists only inside the emailed link, so a DB snapshot leak cannot be replayed), **30-minute** expiry, **single-use** (cleared on success).
- **Reset revokes every session** ("sign out everywhere") and sends a success-confirmation email.
- **New password re-screened**: minimum 8 characters + HaveIBeenPwned breach check.

## Registration page (fake accounts and spam)

- **Strict email verification**: a new account is unverified until the emailed link is clicked; unverified accounts cannot log in, hold no token, and belong to no workspace.
  Verification tokens are random, stored hashed, and single-use.
  Email links always point at the FRONTEND domain, never the raw API host (a bare API link in email is a phishing pattern - it got the API domain flagged by Chrome Safe Browsing).
- **Disposable-email blocklist**: register-user and register-lead refuse temporary-mail domains (bundled `disposable-email-domains` list, ~120k domains, subdomain-aware, zero runtime network calls).
- **Password quality at every set point**: minimum 8 characters + HaveIBeenPwned k-anonymity breach check (only 5 chars of the SHA-1 leave the server; fail-open on HIBP outage) at register, reset, change, and activate.
- **Per-IP limit**: 5 registrations / hour / IP; per-address activation-email cooldown on the lead flow.
- **No ghost access after verification**: a verified user with no workspace gets only an onboarding-scoped token, valid solely on the onboarding endpoints.
- **Unverified Registrations cleanup screen** (`/admin/unverified-users`, SaaS Administration): platform admin reviews all unverified accounts (rows older than 7 days pre-selected) and deletes chosen ones - freeing squatted email addresses.
  The delete endpoint independently refuses anything verified, workspace-linked, or on ADMIN_EMAILS, and reports skips with reasons.
- **Accepted trade-off**: register's "User already exists." message is an enumeration point, kept for UX and mitigated by the rate limit.

## Cloud configuration hardening (2026-07-28)

- **All secrets in Secret Manager**: `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, `MFA_ENCRYPTION_KEY`, `EMAIL_PASS`, `SMTP_ENCRYPTION_KEY` and the JWT keys are secret-backed env vars on login-api and the worker; no plaintext secrets remain in service config.
  The dead `JWT_SECRET` was removed, and the worker's missing `SMTP_ENCRYPTION_KEY` (a live per-company-SMTP bug) was fixed in the same pass.
- **Worker ingress is internal** (it serves no external traffic; health probes bypass ingress).
- **Container vulnerability scanning** enabled on Artifact Registry (Container Scanning API) - pushed images are scanned automatically.
- **Dependabot** watches `apps/api` and `apps/web` weekly (grouped PRs against `dev`; Angular excluded - it moves only via `ng update`).
- **DB transit encryption is BLOCKED SERVER-SIDE**: the external Postgres (self-hosted) runs with `ssl = off`, so the client cannot negotiate TLS.
  The client is ready - set `DB_SSL=require` (encrypt, self-signed OK) or `DB_SSL=verify` (cert-verified) on the services once the server enables SSL (`postgresql.conf`: `ssl = on` + server cert).
  Until then, DB traffic is plaintext over the public internet - the top remaining infrastructure risk, together with the DB being publicly reachable at all.

## Parked (deliberate, with triggers)

- **WAF (Cloud Armor) + external HTTPS load balancer + custom domain**: one pre-launch milestone (the LB is required for all three; the custom domain also retires the run.app Safe Browsing reputation issue).
- **CAPTCHA / reCAPTCHA Enterprise**: only if real bot abuse is observed (rides on the same LB).
- **Shared rate-limit store (Redis/Memorystore)**: per-IP limits are per-instance today; slot a shared store into `rateLimits.js` if instance counts grow.
- **Safe Browsing review** of the old API domain via Google Search Console (needs site-ownership - manual).
