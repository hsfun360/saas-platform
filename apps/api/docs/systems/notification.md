# Notification Service

> Status: LIVE as a worker (`src/modules/notification/notification.worker.js`, entry point `outboxworker.js`), deployed as the Cloud Run service `platform-api-outboxworker` (the `platform-api` image with the command overridden; `login-api-outboxworker` was decommissioned 2026-08-01).
> Tier: **Platform**.

## Purpose

Delivers asynchronous messages (templated email today, plus the in-app bell) reliably, decoupled from request handling, using the transactional **outbox** pattern, and hosts the platform's time-driven scans.

## How it works (the outbox)

- Producers write a row to `OutboxMessage` (`platform/outboxMessage.model.js`) **inside the same DB transaction** as their business write, so an event is never lost and never sent for a rolled-back write.
- The worker claims PENDING messages in batches of 10 (`FOR UPDATE SKIP LOCKED`), dispatches each one, and marks it COMPLETED or FAILED with retry (gives up after 5 tries and parks the row as FAILED).
- Two modes, selected by `WORKER_MODE` (`outboxworker.js`):
  - **`poll`** (the default, the legacy always-on loop): polls the outbox every 5s, scans workflow SLA reminders and the golf group lifecycle every 5 minutes, and advances AR statement runs every 30s.
    Requires `--min-instances=1 --no-cpu-throttling` so the loop never scales to zero.
  - **`drain`** (scale-to-zero, the deployed mode): no background loop.
    `POST /drain` claims and sends everything pending, advances active statement runs, drains again (so completion emails go out in the same invocation), and returns; `POST /drain?sweep=1` additionally runs the time-driven work first (the workflow SLA scan, `scanGroupLifecycle` + `scanWaitlist`, and the report-only AR `reconcileAllCompanies` during the 19:00 UTC / 03:00 MYT hour).
    Triggered by (a) the API's best-effort post-commit ping (`platform/outboxWorkerPing.js` - an IAM-authenticated OIDC call to `OUTBOX_WORKER_URL`; no-op when unset; every failure swallowed) for seconds-fast delivery, and (b) a Cloud Scheduler sweep every 5 minutes as the delivery guarantee for lost pings.
    A statement run that exhausts its time budget kicks a detached self-ping (`fireDrainPing`) so slices continue without waiting for the sweep.
    Auth is Cloud Run IAM (`--no-allow-unauthenticated` + `run.invoker`), so any request reaching the handler is already authenticated.
    Deploy with min-instances=0 and default CPU throttling; Cloud Run bills only while draining.
  See the `deploy-worker` skill.

## Email templating (render at store)

Email content is data-driven, not hardcoded.
See the `email-templating-engine` memory for the full map.
In short:

- `EmailTemplate` (`modules/notification/emailTemplate.model.js`): Handlebars `subject` + `bodyHtml`, plus per-template brand settings `brandColor` + `includeLogo` (see **Email branding** below).
  Seeded on API boot from `email-templates.catalog.js` (insert-only; `seedPlatformDefaults()` runs on every boot).
  Rows resolve as a **three-level cascade**:

  | accountId | companyId | Row |
  | --- | --- | --- |
  | NULL | NULL | the platform default for that key |
  | set | NULL | the subscriber-wide override (all their companies) |
  | set | set | that ONE company's override (**wins**) |

  `resolveTemplate(templateKey, accountId, companyId)` walks company -> subscriber -> platform, skipping rows that are disabled, and only honours overrides when the platform default is `tenantOverridable`.
  This is what lets two clubs on one subscription (e.g. KL G&CC and Tropicana G&CR) each send the same email type with their **own content and their own brand colour**.
  A subscriber that wants one version everywhere just keeps the subscriber-wide row.
- `enqueueEmail({ templateKey, accountId, companyId, to, data, forcePlatformSender }, tx)` (`emailOutbox.js`) renders the effective template **at enqueue time** and writes an `OutboxMessage` of type `EmailQueued` whose payload holds the finished `{ templateKey, to, from, subject, html }` plus `accountId` and `companyId`, then pings the drain-mode worker after commit.
  It returns `false` when the template is disabled.
- The worker's `EmailQueued` branch just dispatches that payload, so template logic never lives in the worker.
- **Subjects compile with Handlebars `noEscape`** (separate compile cache from bodies): a subject is a plain-text mail header, so HTML-escaping it would show a literal `&amp;` in the inbox for values like "Golf & Country Club".
  Bodies keep the default auto-escaping (XSS safety).

### The 21 template keys (`email-templates.catalog.js`)

| Key | Producer | Notes |
| --- | --- | --- |
| `user.activation` | Identity register | Email verification link (frontend URL). |
| `account.activation` | Identity lead activation | Workspace set-up link. |
| `password.reset` | Identity forgot-password | Brand from the identity scope; platform mailer. |
| `password.reset.sso` | Identity forgot-password | Guidance for an SSO account instead of an enumeration hint. |
| `password.reset.success` | Identity reset-password | Confirmation; platform mailer. |
| `collaborator.invite` | Control Plane invitations | Company SMTP. |
| `membership.welcome` | Membership create | Carries the portal registration link for individual members. |
| `sales-agent.invite` | Membership sales agents | Invite-to-login link. |
| `profile.updated` | Identity profile update | Security alert; platform mailer. |
| `workflow.task.assigned` | Workflow engine | One per approver at step activation. |
| `workflow.task.reminder` | Workflow SLA scan | Once per overdue task. |
| `workflow.completed` | Workflow engine | Submitter outcome. |
| `ar.statement-run-completed` | AR statement runs | Initiator, exactly once per run. |
| `golf.booking.confirmed` | Golf booking | One email, every player in To. |
| `golf.booking.cancelled` | Golf booking cancel | Same shape. |
| `golf.noshow.charged` | Golf no-show posting | Booker, posted rows only. |
| `golf.group.hold-expiring` | Golf lifecycle scan | Creator, 24h warning. |
| `golf.group.hold-expired` | Golf lifecycle scan | Creator. |
| `golf.group.deposit-due` | Golf lifecycle scan | Creator + organiser (`isOrganiser` wording). |
| `golf.group.lapsed` | Golf lifecycle scan | Creator + organiser. |
| `golf.group.waitlist-offer` | Golf waitlist | The next-in-line booking's creator. |

## In-app notifications (the header bell)

- `Notification` (`modules/notification/notification.model.js`, `public` schema; approved 2026-08-08): `userId` (recipient), `companyId` (workspace context, NULL = platform-wide), `type` (e.g. `statement-run-completed`, `workflow-task`, `workflow-outcome`, `ar.debtor-provisioned`, `ar.debtor-provision-failed`, the golf group lifecycle types), `title`, `body`, `linkRoute` (the in-app route to open), `readAt` (NULL = unread, drives the badge), `dismissedAt` (soft-delete from the bell; dismissed rows stay for audit).
  Indexes: `(userId, createdAt)` and a partial `(userId) WHERE readAt IS NULL`.
- Producers never touch the model: they call `platform/notificationGateway.js` - `notifyUser({ userId, companyId, type, title, body, linkRoute, transaction })` (pass the transaction when the bell must appear only if the business tx commits, as the workflow engine does), `emailUser({ userId, companyId, templateKey, data })` (resolves the user's address and the company's account, then `enqueueEmail`), and `emailAddress({ companyId, templateKey, to, data })` (an address that is not a user, e.g. a group booking's organiser).
- `/api/notifications` (`notification.routes.js`, `verifyToken` only - personal data scoped strictly to the JWT's userId, no menu RBAC): `GET /my` (latest 30 undismissed + unread count), `PATCH /:id/read`, `POST /read-all`, `PATCH /:id/dismiss` (an unread one settles at the same time so the badge never counts a hidden row), `POST /dismiss-all`.
  These routes do not mount `validate()` yet (part of the control-plane rollout).

## Scheduled scans hosted by the worker

Time-driven work lives on the worker tick, never in an API request:

- **Workflow SLA reminders** (`workflow.reminders.scanSlaReminders`): pending tasks past `dueAt` get one reminder email + bell, or escalate to the next step when the step says so (see workflow.md).
- **Golf group lifecycle** (`groupLifecycle.scanGroupLifecycle`, which also runs `scanWaitlist`): 24-hour warnings, tentative holds past `holdExpiresAt` released, approved bookings past `depositDueAt` lapsed, waitlist offers expired and the next entry offered (see golf-management.md).
- **AR statement runs** (`arStatement.processActiveRuns`): the `ar.StatementRun` row is the job queue; the worker advances active runs in time-boxed slices under a lease.
- **AR reconciliation** (`arReconciliation.reconcileAllCompanies`, report-only): drain-mode sweeps during the 19:00 UTC hour.

## Email editor (WYSIWYG + variables)

Both template surfaces are edited in the browser, not as raw HTML.

- The **body** uses a WYSIWYG editor (self-hosted TinyMCE 7, GPL build, served from `/tinymce`; no cloud, no API key).
  It is a shared Angular `ControlValueAccessor`, `<app-email-html-editor>` (`apps/web/src/app/shared/email-html-editor/`), so it binds to a reactive form exactly like the old textarea (`formControlName="bodyHtml"`).
- Declared `{{variables}}` render as non-editable **chips** in the editor.
  The chip conversion happens in text nodes only, so a token inside an attribute (e.g. `href="{{acceptLink}}"`) is never corrupted, and the value read/written to the form is always plain Handlebars.
- The **Subject** field has its own **Insert variable** menu (shared `<app-variable-menu>`), because it is plain text rather than the rich editor.
- `{{#if}}` / `{{#each}}` logic has no visual form; edit it via the editor's source (`</>`) view.
- Same components, two screens: platform templates for a System Admin (`/admin/email-templates/:key`) and a subscriber's overrides for a Tenant Admin (`/admin/account-email-templates/:key`).

TinyMCE is served from the app itself: `angular.json` copies `node_modules/tinymce` to `/tinymce` at build time.
After a web deploy, `GET /tinymce/tinymce.min.js` must return 200, or the editor will not load.

## Email branding (header band + logo + button colour)

Emails carry a brand: a coloured header band, the sending company's logo, and brand-coloured call-to-action buttons.

### The rules (the decisions)

These are the agreed rules; the subsections below are how they are implemented.

1. **Brand lives on the TEMPLATE, per scope - never on the company.**
   The accent colour + include-logo flag are `EmailTemplate` columns, resolved through the cascade.
   (A per-company `Company.brandColor` approach was tried and deliberately reverted - a company has one logo, but each template can want its own colour.)
2. **The cascade decides whose brand wins:** company override -> subscriber-wide override -> platform default.
   Two clubs on one subscription each get their own colour + content; a subscriber that wants one look everywhere keeps only the subscriber-wide row.
3. **The logo is ALWAYS the sending company's `Company.logo`** - never uploaded or stored per template, and shown only when `includeLogo` is ticked.
   (A transparent PNG blends into the band; a white-background image keeps its white - that lives in the image file, not the HTML.)
4. **Branding is applied automatically at render, not baked into the body.**
   So it works on any body - old, customised, or default - with **no "reset to default"**.
   The output is one clean card: the colour header band (with centred logo) on top, and CTA buttons recoloured to the brand.
5. **Only brand when a colour is actually set.**
   No colour configured = platform-neutral (no band, buttons untouched).
   The default `#2563eb` exists only so a `{{brandColor}}` reference never renders empty.
6. **Colour must be hex; logo URL must be `http(s)`.**
   Validated server-side so neither can inject markup/CSS.
7. **Security / account emails resolve their brand from the IDENTITY, and always send via the platform mailer.**
   `password.reset`, `password.reset.sso`, `password.reset.success`, and `profile.updated` have no `companyId` to hand in, so the producer derives a scope from the user (see below) - degrading to platform-neutral when ambiguous - and passes `forcePlatformSender: true` so delivery never depends on a tenant SMTP.
   (Product emails like `membership.welcome` / invitations DO use the company SMTP.)

### Where it is configured

Brand settings live **on the email template** (not on the company), edited from a **Brand settings** card at the top of each editor screen.

- `EmailTemplate` carries two columns: `brandColor` (hex, e.g. `#10b981`) and `includeLogo` (boolean).
- The **logo is not stored on the template**: it is always the sending company's existing `Company.logo` (reused as-is, no new column and no separate upload), shown only when `includeLogo` is on.
- The Brand card holds a colour picker + hex field (the picker mirrors the hex control), a read-only preview of the company logo, and an "Include in email header" checkbox.

### How it is applied (automatic, at render)

Branding is applied by `emailBrand.applyBrandToHtml(compiledBody, brand)`, called by BOTH `renderEmail` (real sends) and `renderPreview` (live preview + test send).
This is deliberate: bodies do **not** need to reference any brand variable, so branding works on old and customised templates **without a "reset to default"**.

1. **CTA buttons** are recoloured: any styled `<a>` with an inline `background`/`background-color` is set to `brandColor` (only when a colour is actually configured).
2. The body is rebuilt into **one clean card**: `unwrapOuterCard()` strips the body's own outer card `<div>` (so there is no card-in-a-card), then the content is wrapped in a bordered, rounded, `max-width:600px` card whose full-bleed **rounded top is the header band** (colour + centred logo).
   The band lives inside the card, matching the in-app preview.

- Catalogue bodies (`email-templates.catalog.js`) are **content only**; the card, band, and button colour are all added at render.
- `brandColor` comes from the effective template row; the logo is fetched from `Company.logo` for the send's `companyId`, and only when `includeLogo` is on.
- Colour is validated as hex and the logo URL as `http(s)` only, so neither can inject markup/CSS.
- A transparent-background logo blends into the band; a logo saved with a white background keeps that white, because that lives in the image file, not in the HTML.

### Security / account emails: scope resolved from the identity

`password.reset`, `password.reset.sso`, `password.reset.success`, and `profile.updated` are tenant-overridable too, but they are triggered by an **email address alone** (or a context we don't brand from), so there is no `companyId` to hand in.
The producer resolves one via `platform/identityScope.resolveIdentityScope(user)` -> `{ accountId, companyId }`, which the cascade then uses:
1. the user's last-used workspace (`User.lastWorkspaceId`), when it's a real company;
2. else the single company they belong to (staff `CompanyUser` **or** member link);
3. else, if all their companies share one account, that account (subscriber-wide);
4. else the platform default.
Identity is global but membership is many, and a reset is about the login, not one club - so anything ambiguous (spans accounts, or unknown) degrades to the platform default rather than guessing.

**These stay on the platform mailer even when branded.**
`enqueueEmail(..., { forcePlatformSender: true })` brands the email for the resolved company (colour / logo / copy) but nulls the payload `companyId` so the worker does NOT route through a tenant SMTP - a password reset must not fail because a club's mail server is misconfigured.
(Product emails like `membership.welcome` / invitations still use the company SMTP.)

### Live preview + test send

Both editors send the current (unsaved) `brandColor` + `includeLogo` on every **preview** and **test-send** request, so what the author sees and tests matches what will be stored.
The tenant editor resolves the real active company's logo; the platform editor has no sending company, so its preview shows the colour + band but no logo.
Test sends write an `EmailQueued` row directly (templateKey suffixed `(test)`).

## Per-company SMTP (outgoing mail server)

A subscriber can give each **company** its own SMTP server, so mail sent on that company's behalf goes out from the company's own address instead of the platform mailer.

### Data

- `CompanySmtpConfig` (`modules/saas/companySmtpConfig.model.js`, Control-Plane owned), one row per company: `host, port, secure, username, passwordEnc, fromEmail, fromName, isActive, lastVerifiedAt, lastError`.
- The password is stored **encrypted at rest** with AES-256-GCM (`platform/secretbox.js`, key `SMTP_ENCRYPTION_KEY`) and is never returned to the client.

### Send path

The **same outbox worker** delivers company email; it only chooses the transport at dispatch:

```
producer (has companyId)
  -> OutboxMessage { type: EmailQueued, payload: { ..., companyId } }   [same DB tx]
  -> platform-api-outboxworker drains (ping or sweep)
  -> dispatchEmail(payload):
       companyId has an ACTIVE CompanySmtpConfig?
         yes -> send via that company's SMTP, from its address
                 on failure: record lastError, retry -> FAILED (NO platform fallback)
         no  -> send via the platform mailer (Gmail transport in mailer.js)
```

- `companyMailer.resolveTransport(companyId)` builds and caches a Nodemailer transport per company (rebuilt when the config's `updatedAt` changes) and decrypts the password with `secretbox`.
- **Policy (chosen):** a configured company sends **only** through its own server.
  There is no fallback to the platform on failure; the message retries and then goes FAILED, and the error is surfaced on the company's SMTP screen (`lastError`).
- **Platform/security emails always use the platform mailer.**
  Sign-up activation, password reset, and reset-success carry no `companyId`, so they never touch a tenant server.
  Tenant-context email (collaborator invitations, the membership welcome and sales-agent invitations, workflow, AR and golf emails) uses company SMTP.

### Configuration UI + API (Tenant Admin, per company)

- UI: Companies screen, per-company **"Email (SMTP)"** button opens `CompanySmtpDialogComponent` (host/port/TLS, username, password, from-email, from-name, active, plus Verify-and-send-test and Remove).
- API (`tenant.controller.js`, gated by `resolveTargetCompany` so only that company's admins can touch it): `GET/PUT/DELETE /auth/companies/:companyId/smtp` and `POST /auth/companies/:companyId/smtp/test`.
- A blank password on save keeps the stored one.
  **The test send is synchronous from `platform-api`** (verify the connection, then send), for immediate feedback, which is why the API also needs `SMTP_ENCRYPTION_KEY`.
  Everything that reaches a real recipient still flows through the outbox worker.

## Secrets / config

| Var | Where | Purpose |
| --- | --- | --- |
| `EMAIL_USER` / `EMAIL_PASS` | worker (+ API for the synchronous SMTP test) | Platform Gmail transport (App Password). |
| `SMTP_ENCRYPTION_KEY` | **platform-api AND platform-api-outboxworker** | 32-byte key (64 hex or base64) for AES-256-GCM of company SMTP passwords. Held in **Secret Manager**, attached via `--update-secrets` (like the JWT keys). **Keep it stable**: rotating it makes stored SMTP passwords undecryptable (a re-encrypt step would be needed). The API encrypts on save + decrypts for the test; the worker decrypts to send. |
| `FRONTEND_BASE_URL` | platform-api AND the worker | Base URL used in email links (the worker renders statement-run, workflow reminder and golf lifecycle emails itself). |
| `WORKER_MODE` | worker | `drain` (deployed) or `poll` (default). |
| `OUTBOX_WORKER_URL` | platform-api AND the worker | The worker's root URL for the post-commit ping and the statement-run self-ping; unset = no ping, the sweep is the guarantee. |
| `DATABASE_URL`, the JWT keys | both | Shared with the API (same image). |

## Owns (data)

- `OutboxMessage` processing state, `EmailTemplate`, `Notification`.
  `CompanySmtpConfig` is Control-Plane owned and read here.
  (Tables are shared infra today; when services split, each keeps its own outbox and publishes to a broker.)

## Event / message types (current)

- `EmailQueued` - every templated email (the path all email uses).
- `DebtorProvisionRequested` and `DebtorCreditLimitSyncRequested` - Membership -> AR through `arGateway`; the worker calls `debtorProvisioning.service` (`provisionDebtor` / `syncCreditLimit`) and bells the requester on open or terminal failure.
  When AR splits, these route to the AR service's own consumer.
- `UserRegistered` - still written by the Google / Microsoft SSO sign-up paths; the worker logs and skips it (SSO users are already verified).
  The local-register path sends `user.activation` as `EmailQueued` instead.
- `TenantProvisioned` - written by `provisionTenant`; no consumer branch yet.
- Legacy hardcoded senders kept in the worker for any in-flight messages only: `PasswordResetRequested`, `PasswordResetSuccess`, `AccountRegistered`, `CollaboratorInvited`, `UserProfileUpdated` - nothing produces them any more.

## Deploy notes

- Worker and API share one image (build the API image, then deploy both).
  The worker must be redeployed to pick up worker-code changes, and BEFORE the API when a change adds a template the API will enqueue.
- Set `SMTP_ENCRYPTION_KEY` on both services; until it is set, the SMTP screens return a clear "encryption not configured" error and nothing else is affected.
- New columns/tables apply on API boot via the fingerprint-gated `sequelize.sync({ alter: true })`.
- Per-company template overrides needed ONE manual DDL before their deploy: the old `UX_EmailTemplate_account_key` plain unique on `(accountId, templateKey)` would block a company row from coexisting with the subscriber-wide row, and `sync({ alter: true })` does not drop/replace an existing unique index (`DROP INDEX IF EXISTS "UX_EmailTemplate_account_key";`, then boot creates the new partial + company indexes).
  Done on dev and staging.
- **Email editor + branding** ship as an **API + web** change (no new secrets, no worker change: rendering runs in the API at enqueue and in the live preview).
  Existing template rows do **not** need a "reset to default": branding is applied at render, so setting a colour / ticking the logo just works.
  After the web deploy, confirm `GET /tinymce/tinymce.min.js` is 200.

## Migration target

- Generalize to a **Notification service** backed by **Google Pub/Sub** (fits Cloud Run) - FUTURE, not started: services publish events; subscribers react.
  The outbox becomes the publish step.
  `CompanySmtpConfig` / `EmailTemplate` lookups become control-plane reads.

## Migration status

- [x] Worker (poll + drain modes) · [x] Templating · [x] Branding · [x] Per-company SMTP · [x] In-app bell · [x] Scheduled scans · [ ] validate() on `/api/notifications` · [ ] Pub/Sub transport · [ ] Per-service outbox · [ ] Own deploy
