# External Penetration Test - Scoping Document

Status: DRAFT for vendor quotation.
Fill the bracketed fields (test window, contacts) before sending; final URLs firm up when the WAF/custom-domain milestone deploys.

## 1. About the target

Multi-tenant SaaS club-management platform (membership, golf, facility management) for clubs in Southeast Asia.
Single production environment on Google Cloud Run behind Cloud Armor WAF and an external HTTPS load balancer (deployment of that edge is a prerequisite of this test and will be live before the test window).

| Component | Technology | Exposure |
| --- | --- | --- |
| Web app (SPA) | Angular 20, zoneless, served by nginx | Public |
| API | Node.js / Express 5, Sequelize ORM | Public |
| Outbox worker (email) | Node.js | Internal-only ingress (out of scope, listed for completeness) |
| Database | PostgreSQL 18, self-hosted | Not directly reachable; reached only via the API |
| Identity | Local (bcrypt + optional TOTP MFA) plus Google & Microsoft SSO; RS256 JWT (1 h) + rotating httpOnly refresh cookies | |

## 2. Target URLs

Production domain (single-host, same-origin, live 2026-07-29):

- Web app: `https://www.myeasysoft.com` (apex `https://myeasysoft.com` redirects/serves the same app)
- API: `https://www.myeasysoft.com/api` (path-routed to the API behind the same load balancer and Cloud Armor WAF)

All traffic terminates on a global external HTTPS load balancer with Cloud Armor WAF (SQLi enforced; XSS monitored) in front of both backends. HTTP redirects to HTTPS.

Direct Cloud Run URLs (origin servers behind the load balancer; **out of scope** as test targets - test via the domain so the WAF and LB are exercised):

- `https://login-web-148523901156.asia-southeast1.run.app`
- `https://login-api-148523901156.asia-southeast1.run.app`

## 3. Test type and scope

**Grey-box web application and API penetration test**, credentialed, against production infrastructure using dedicated test tenants.

In scope:

1. The full web application: staff back-office, System Admin (platform) area, self-service onboarding wizard, member portal, sales-agent portal.
2. The full API surface: roughly 314 REST endpoints under `/api/*`, of which 17 are unauthenticated (login, registration, password reset, email verification, SSO exchange, MFA step-up, portal registration).
3. Authentication and session management: password flows, HIBP/breach handling, rate limiting and backoff behaviour, TOTP MFA including forced admin enrollment and recovery codes, refresh-token rotation and replay revocation, logout/revocation.
4. **Authorization - the priority of this engagement:**
   - **Horizontal, cross-tenant: prove or disprove that one tenant can read or affect another tenant's data.** Two dedicated test tenants are provided for exactly this.
   - Vertical: staff role escalation (menu/action grants, data scopes own/department/all), tenant user reaching platform-admin functions, portal identities (member/agent) reaching staff functions.
5. Input handling: the API validates request shapes with Zod at the boundary; probe for gaps, mass-assignment, injection (SQL via ORM edges, template injection in the Handlebars email templating), file upload handling (avatar images, Excel membership import).
6. Business logic: onboarding/provisioning flow, invitation flows, numbering, workflow approvals, import staging/migration.

Out of scope:

- Denial of service and volumetric testing.
- Social engineering, phishing, physical access.
- Third-party infrastructure itself (Google Cloud, Azure, GoDaddy DNS, SSO IdPs, subscriber SMTP servers).
- The internal-only outbox worker and the nightly backup job (no public surface).
- Destructive testing against non-test tenants (production is shared; see rules of engagement).

## 4. Test accounts and tenants

Two dedicated test tenants are provisioned by the idempotent script
[`apps/api/scripts/seed-pentest-tenants.js`](../../apps/api/scripts/seed-pentest-tenants.js)
(re-run any time to reset; `--remove` to tear down).
All addresses use `@example.com` (RFC 2606, never a real mailbox); passwords are
generated at seed time, printed once, and delivered to the vendor through the
secure channel below - never committed.

Provisioned now (verified 2026-07-29):

| Tenant | Company | Accounts |
| --- | --- | --- |
| Pentest Alpha Club | Alpha Golf & Country Club | `pentest-a-admin` (Tenant Admin), `pentest-a-officer` (Membership Officer, data scope **own**, view-only), `pentest-a-supervisor` (Membership Supervisor, data scope **department**) |
| Pentest Bravo Club | Bravo Leisure Club | `pentest-b-admin`, `pentest-b-officer`, `pentest-b-supervisor` (same role matrix) |

Plus `pentest-limbo@example.com` - a verified user with **no workspace**, for the onboarding-limbo state.

- Tenant Admins are **not** pre-enrolled in MFA: the platform forces admin MFA enrollment at first login, which is itself in scope to test.
- Both tenants carry the same role matrix so **cross-tenant isolation** can be probed from equivalent positions (e.g. can Alpha's Officer reach Bravo's data), and both staff roles sit in the same department with different `Position.rank` so **data-scope** (own vs department) is testable.

To be added before the window (need product records set up first): a **portal member** + fresh registration link and a **sales-agent** + invite link (member/agent portals). A platform-level **System Admin** for testing the platform/tenant boundary from above is an existing SSO admin account, not seeded here.

## 5. Rules of engagement

- Test window: `[START DATE]` to `[END DATE]`, `[N]` tester-days.
- Testing is against production infrastructure with test tenants; **do not modify or read real subscriber tenants** - any accidental access to non-test tenant data is an immediate stop-and-report finding.
- A fresh database backup is taken immediately before the window (ad-hoc `db-backup` job run); the platform team is on call during the window.
- Source IPs: vendor supplies tester IPs in advance; they are exempted from per-IP rate limiting for the window so throttling does not consume tester-days (rate-limit behaviour itself is verified separately at the end of the window from a non-exempt IP).
- Findings channel: `[SECURE CHANNEL]`; Critical/High findings are reported within 24 hours of discovery, not held for the report.
- Emergency contact both directions: `[NAME / PHONE / EMAIL]`.

## 6. Deliverables required from the vendor

- Report with CVSS-scored findings, reproduction steps, and evidence, plus an executive summary suitable for ISO 27001 audit evidence.
- Debrief call.
- **Retest of remediated findings within 60 days, included in the engagement price.**
- Testers named, with certifications (CREST membership and/or OSCP/OSWE preferred).

## 7. Our commitments

- Critical findings are patched within 48 hours, High within 1 week (per our vulnerability management policy), so the retest can close them.
- Architecture walkthrough call before the window and credentials/URLs delivered `[X]` days before start.
