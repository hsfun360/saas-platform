# Notification Service

> Status: LIVE as a worker (`src/modules/notification/notification.worker.js`,
> entry point `outboxworker.js`), deployed as Cloud Run service
> `login-api-outboxworker`. Tier: **Platform**.

## Purpose
Delivers asynchronous messages (email today) reliably, decoupled from request
handling, using the transactional **outbox** pattern.

## How it works (the outbox)
- Producers write a row to `OutboxMessage` (`platform/outboxMessage.model.js`)
  **inside the same DB transaction** as their business write, so an event is never
  lost and never sent for a rolled-back write.
- The worker polls PENDING messages every ~5s (`FOR UPDATE SKIP LOCKED`), sends
  each one, and marks it COMPLETED or FAILED with retry (gives up after 5 tries).
- The worker runs with `--min-instances=1 --no-cpu-throttling` so its poll loop
  never scales to zero. See the `deploy-worker` skill.

## Email templating (render at store)
Email content is data-driven, not hardcoded. See the `email-templating-engine`
memory for the full map. In short:

- `EmailTemplate` (`modules/notification/emailTemplate.model.js`): Handlebars
  `subject` + `bodyHtml`, plus per-template brand settings `brandColor` +
  `includeLogo` (see **Email branding** below). Seeded on API boot from
  `email-templates.catalog.js`. Rows resolve as a **three-level cascade**:

  | accountId | companyId | Row |
  | --- | --- | --- |
  | NULL | NULL | the platform default for that key |
  | set | NULL | the subscriber-wide override (all their companies) |
  | set | set | that ONE company's override (**wins**) |

  `resolveTemplate(templateKey, accountId, companyId)` walks company -> subscriber
  -> platform, skipping rows that are disabled, and only honours overrides when the
  platform default is `tenantOverridable`.
  This is what lets two clubs on one subscription (e.g. KL G&CC and Tropicana G&CR)
  each send the same email type with their **own content and their own brand colour**.
  A subscriber that wants one version everywhere just keeps the subscriber-wide row.
- `enqueueEmail({ templateKey, accountId, companyId, to, data }, tx)`
  (`emailOutbox.js`) renders the effective template **at enqueue time** and writes
  an `OutboxMessage` of type `EmailQueued` whose payload holds the finished
  `{ to, from, subject, html }` plus `accountId` and `companyId`.
- The worker's `EmailQueued` branch just dispatches that payload, so template logic
  never lives in the worker.
- **Subjects compile with Handlebars `noEscape`** (separate compile cache from
  bodies): a subject is a plain-text mail header, so HTML-escaping it would show a
  literal `&amp;` in the inbox for values like "Golf & Country Club".
  Bodies keep the default auto-escaping (XSS safety).

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

### Where it is configured
Brand settings live **on the email template** (not on the company), edited from a **Brand settings** card at the top of each editor screen.

- `EmailTemplate` gains two columns: `brandColor` (hex, e.g. `#10b981`) and `includeLogo` (boolean).
- The **logo is not stored on the template**: it is always the sending company's existing `Company.logo` (reused as-is, no new column and no separate upload), shown only when `includeLogo` is on.
- The Brand card holds a colour picker + hex field (the picker mirrors the hex control), a read-only preview of the company logo, and an "Include in email header" checkbox.

### How it is applied (automatic, at render)
Branding is applied by `emailBrand.applyBrandToHtml(compiledBody, brand)`, called by BOTH `renderEmail` (real sends) and `renderPreview` (live preview + test send).
This is deliberate: bodies do **not** need to reference any brand variable, so branding works on old and customised templates **without a "reset to default"**.

1. **CTA buttons** are recoloured: any styled `<a>` with an inline `background`/`background-color` is set to `brandColor` (only when a colour is actually configured).
2. The body is rebuilt into **one clean card**: `unwrapOuterCard()` strips the body's own outer card `<div>` (so there is no card-in-a-card), then the content is wrapped in a bordered, rounded, `max-width:600px` card whose full-bleed **rounded top is the header band** (colour + centred logo). The band lives inside the card, matching the in-app preview.

- Catalogue bodies (`email-templates.catalog.js`) are now **content only**; the card, band, and button colour are all added at render.
- `brandColor` comes from the effective template row; the logo is fetched from `Company.logo` for the send's `companyId`, and only when `includeLogo` is on.
- Colour is validated as hex and the logo URL as `http(s)` only, so neither can inject markup/CSS.
- A transparent-background logo blends into the band; a logo saved with a white background keeps that white, because that lives in the image file, not in the HTML.

### Live preview + test send
Both editors send the current (unsaved) `brandColor` + `includeLogo` on every **preview** and **test-send** request, so what the author sees and tests matches what will be stored.
The tenant editor resolves the real active company's logo; the platform editor has no sending company, so its preview shows the colour + band but no logo.

## Per-company SMTP (outgoing mail server)
A subscriber can give each **company** its own SMTP server, so mail sent on that
company's behalf goes out from the company's own address instead of the platform
mailer.

### Data
- `CompanySmtpConfig` (`modules/saas/companySmtpConfig.model.js`), one row per
  company: `host, port, secure, username, passwordEnc, fromEmail, fromName,
  isActive, lastVerifiedAt, lastError`.
- The password is stored **encrypted at rest** with AES-256-GCM
  (`platform/secretbox.js`, key `SMTP_ENCRYPTION_KEY`) and is never returned to the
  client.

### Send path
The **same outbox worker** delivers company email; it only chooses the transport
at dispatch:

```
producer (has companyId)
  -> OutboxMessage { type: EmailQueued, payload: { ..., companyId } }   [same DB tx]
  -> login-api-outboxworker polls
  -> dispatchEmail(payload):
       companyId has an ACTIVE CompanySmtpConfig?
         yes -> send via that company's SMTP, from its address
                 on failure: record lastError, retry -> FAILED (NO platform fallback)
         no  -> send via the platform mailer (Gmail transport in mailer.js)
```

- `companyMailer.resolveTransport(companyId)` builds and caches a Nodemailer
  transport per company (rebuilt when the config's `updatedAt` changes) and
  decrypts the password with `secretbox`.
- **Policy (chosen):** a configured company sends **only** through its own server.
  There is no fallback to the platform on failure; the message retries and then
  goes FAILED, and the error is surfaced on the company's SMTP screen (`lastError`).
- **Platform/security emails always use the platform mailer.** Sign-up activation,
  password reset, and reset-success carry no `companyId`, so they never touch a
  tenant server. Only tenant-context email (collaborator invitations and the
  membership welcome email today) uses company SMTP.

### Configuration UI + API (Tenant Admin, per company)
- UI: Companies screen, per-company **"Email (SMTP)"** button opens
  `CompanySmtpDialogComponent` (host/port/TLS, username, password, from-email,
  from-name, active, plus Verify-and-send-test and Remove).
- API (`tenant.controller.js`, gated by `resolveTargetCompany` so only that
  company's admins can touch it):
  `GET/PUT/DELETE /auth/companies/:companyId/smtp` and
  `POST /auth/companies/:companyId/smtp/test`.
- A blank password on save keeps the stored one. **The test send is synchronous
  from `login-api`** (verify the connection, then send), for immediate feedback,
  which is why the API also needs `SMTP_ENCRYPTION_KEY`. Everything that reaches a
  real recipient still flows through the outbox worker.

## Secrets / config
| Var | Where | Purpose |
| --- | --- | --- |
| `EMAIL_USER` / `EMAIL_PASS` | worker | Platform Gmail transport (App Password). |
| `SMTP_ENCRYPTION_KEY` | **login-api AND login-api-outboxworker** | 32-byte key (64 hex or base64) for AES-256-GCM of company SMTP passwords. Held in **Secret Manager**, attached via `--update-secrets` (like the JWT keys). **Keep it stable**: rotating it makes stored SMTP passwords undecryptable (a re-encrypt step would be needed). The API encrypts on save + decrypts for the test; the worker decrypts to send. |
| `FRONTEND_BASE_URL` | login-api | Base URL used in email links. |

## Owns (data)
- `OutboxMessage` processing state, `EmailTemplate`, `CompanySmtpConfig`.
  (Tables are shared infra today; when services split, each keeps its own outbox
  and publishes to a broker.)

## Event / message types (current)
- `EmailQueued` (templated, the path all new email uses).
- Legacy per-type senders kept for any in-flight messages: `UserRegistered`,
  `PasswordResetRequested`, `PasswordResetSuccess`, `AccountRegistered`,
  `CollaboratorInvited`, `UserProfileUpdated`.

## Deploy notes
- Worker and API share one image (build the API image, then deploy both). The
  worker must be redeployed to pick up worker-code changes.
- Set `SMTP_ENCRYPTION_KEY` on both services before/at the deploy that ships this;
  until it is set, the SMTP screens return a clear "encryption not configured"
  error and nothing else is affected.
- New columns/tables apply on API boot via `sequelize.sync({ alter: true })`.
- ⚠️ **Per-company template overrides need ONE manual DDL BEFORE the deploy.** The
  old `UX_EmailTemplate_account_key` is a plain unique on `(accountId, templateKey)`,
  which would block a company row from coexisting with the subscriber-wide row.
  `sync({ alter: true })` does **not** drop/replace an existing unique index, so run
  this against the DB first, then deploy (boot creates the new partial + company
  indexes):
  ```sql
  DROP INDEX IF EXISTS "UX_EmailTemplate_account_key";
  ```
  Dropping it early is safe: nothing creates duplicate account rows (the upsert keys
  on the scope), so the old code keeps working until the new revision starts.
- **Email editor + branding** ship as an **API + web** change (no new secrets, no
  worker change: rendering runs in the API at enqueue and in the live preview).
  The new `EmailTemplate.brandColor` / `includeLogo` columns apply via the boot
  `sync({ alter: true })`. Existing template rows do **not** need a "reset to
  default": branding is applied at render, so setting a colour / ticking the logo
  just works. After the web deploy, confirm `GET /tinymce/tinymce.min.js` is 200.

## Migration target
- Generalize to a **Notification service** backed by **Google Pub/Sub** (fits Cloud
  Run): services publish events; subscribers react. The outbox becomes the publish
  step. `CompanySmtpConfig` / `EmailTemplate` lookups become control-plane reads.

## Migration status
- [x] Worker · [x] Templating · [x] Per-company SMTP · [ ] Pub/Sub transport ·
  [ ] Per-service outbox · [ ] Own deploy
