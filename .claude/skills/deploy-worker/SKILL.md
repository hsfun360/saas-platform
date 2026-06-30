---
name: deploy-worker
description: Deploy the outbox/notification worker (login-api-outboxworker) to Cloud Run. It reuses the login-api image with the command overridden to run outboxworker.js, and needs the email + DB env. Use when asked to deploy/redeploy the worker, the email sender, the outbox processor, or fix emails not sending.
---

# Deploy the outbox worker to Cloud Run

Runbook for the background email/outbox worker, deployed as the Cloud Run service
**`login-api-outboxworker`**. PowerShell commands.

Known-good config: project `membership-project-199610`, region `asia-southeast1`.

## What it is
- Entry point `outboxworker.js` → `startWorker()` in
  `src/modules/notification/notification.worker.js`: polls the `OutboxMessage`
  table every ~5s and sends queued emails (Nodemailer/Gmail).
- **Reuses the SAME image as the API** (`login-api`), just with a different command
  (`node outboxworker.js` instead of `node server.js`). There is **no separate
  build** - to ship worker code changes, push a new API image first (the
  `deploy-api` skill), then redeploy this service to pick it up.
- It does NOT verify JWTs, so it needs no JWT keys. `JWT_SECRET` (if present) is
  dead weight - drop it.

## Env vars
| Var | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Read/update the outbox table (same value as the API). URL-encode the password (`@`→`%40`). |
| `EMAIL_USER` | ✅ | Sender Gmail address. |
| `EMAIL_PASS` | ✅ | Gmail **App Password** (not the account password - Gmail SMTP requires an app password). |
| ~~`JWT_SECRET`~~ | ❌ | Unused; drop it. |

## ⚠️ The thing that makes or breaks a Cloud Run worker
A poller has **no incoming HTTP traffic**, so by default Cloud Run **scales it to
zero** and **throttles CPU** outside requests - the background loop stops and emails
quietly stop sending. You MUST deploy it with:
- **`--min-instances=1`** - keep one instance always running (never scale to zero).
- **`--no-cpu-throttling`** - CPU always allocated, so the `setInterval` poll keeps
  running between (non-existent) requests.

The worker doesn't serve real traffic, so it can also be locked down:
`--no-allow-unauthenticated --ingress=internal` (optional hardening).

## Deploy (every release)
```powershell
$env:PROJECT_ID = "membership-project-199610"
$env:REGION     = "asia-southeast1"
# Reuses the API image - push it first via the deploy-api skill.
$IMAGE = "$($env:REGION)-docker.pkg.dev/$($env:PROJECT_ID)/login-api/login-api:latest"

gcloud run deploy login-api-outboxworker `
  --image $IMAGE `
  --region $env:REGION `
  --command node `
  --args outboxworker.js `
  --min-instances 1 `
  --no-cpu-throttling `
  --set-env-vars DATABASE_URL="postgres://postgres:<DB_PASSWORD_URLENCODED>@<DB_HOST>:<PORT>/<DB_NAME>" `
  --set-env-vars EMAIL_USER="<sender@gmail.com>" `
  --set-env-vars EMAIL_PASS="<gmail-app-password>"
```

> `--set-env-vars` REPLACES all plain env vars (so the full set is listed, dropping
> the dead `JWT_SECRET`). To change just one later, use `--update-env-vars`.

## Verify
```powershell
# Watch the worker boot + poll (look for DB connect and outbox processing).
gcloud run services logs read login-api-outboxworker --region asia-southeast1 --limit 40

# Confirm it's pinned to one always-on instance with CPU always allocated:
gcloud run services describe login-api-outboxworker --region asia-southeast1 `
  --format="yaml(spec.template.metadata.annotations)"
#   expect: autoscaling.knative.dev/minScale: '1'
#           run.googleapis.com/cpu-throttling: 'false'
```
End-to-end test: trigger something that queues an email (e.g. send a collaborator
invitation in the app), then watch the worker logs send it within ~5s and the
OutboxMessage flip to COMPLETED.

## Gotchas
- **Emails not sending?** Almost always (a) the worker scaled to zero / was throttled
  - fix with `--min-instances=1 --no-cpu-throttling`; or (b) bad `EMAIL_PASS` (must be
  a Gmail App Password); or (c) `FRONTEND_BASE_URL` not set on `login-api`, so links
  are wrong (set on the API, not here).
- **Worker code changes don't appear?** The image is shared with the API - build+push
  via `deploy-api` first, then redeploy this service (or it stays on the old image).
- Keep `DATABASE_URL` identical to the API's (same database/outbox).
