---
name: deploy-worker
description: Deploy the outbox/notification worker (platform-api-outboxworker) to Cloud Run. It reuses the platform-api image with the command overridden to run outboxworker.js, and needs the email + DB env plus the drain-mode wiring (post-commit ping + Cloud Scheduler sweep). Use when asked to deploy/redeploy the worker, the email sender, the outbox processor, or to fix emails not sending.
---

# Deploy the outbox worker to Cloud Run

> **The pipeline is the normal path, not this runbook.**
> Pushing to `dev` deploys the worker first, then the api, then web ([`docs/ops/cicd.md`](../../../docs/ops/cicd.md)).
> Use this skill for env/secret changes, the drain-mode wiring on a NEW environment, or when the pipeline is broken.

Commands are **PowerShell**.

## Environments

| | dev | staging |
| --- | --- | --- |
| Project | `my-easy-software-dev` (`855636431759`) | `my-easy-software-staging` (`640963543517`) |
| Region | `asia-southeast3` | `asia-southeast3` |
| Service | `platform-api-outboxworker` | `platform-api-outboxworker` |
| Mode | `drain` (scale-to-zero) | `drain` |

The old `membership-project-199610` / `login-api-outboxworker` was **decommissioned 2026-08-01**.

## What it is

- Entry point `outboxworker.js` -> `startWorker()` in `src/modules/notification/notification.worker.js`: claims queued `OutboxMessage` rows and sends the emails.
- **Reuses the SAME image as the API**, with a different command (`node outboxworker.js` instead of `node server.js`). There is **no separate build** - ship worker code by pushing a new API image (the `deploy-api` skill), then redeploying this service.
- **Standing convention: the worker deploys BEFORE the api**, so outbox/template changes are live in the sender before producers start writing them. The pipeline already orders it this way.
- It does not verify JWTs, so it needs no JWT keys.

## Env vars

| Var | Kind | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | secret | Same database as the API (same outbox table). Dev reaches it through the Cloud SQL connector. |
| `EMAIL_PASS` | secret | Gmail **App Password** (not the account password - Gmail SMTP requires an app password). |
| `SMTP_ENCRYPTION_KEY` | secret | Decrypts per-company SMTP passwords. **Must match the environment the data came from**, or sends fail to decrypt. |
| `EMAIL_USER` | plain | Sender address. Dev: `hsfun360@gmail.com`. |
| `WORKER_MODE` | plain | `drain` for every new environment (see below). |

Per-company SMTP configs are what actually send for tenants; there is no fallback if a tenant's config is broken.

## Two worker modes

**`drain` (scale-to-zero - what dev and staging run; ~zero idle cost).**
No background loop.
`POST /drain` claims and sends everything pending, then returns.
Two triggers, one for speed and one for the guarantee:

1. The api's best-effort post-commit ping (`src/platform/outboxWorkerPing.js`), enabled by setting `OUTBOX_WORKER_URL` **on the API service**. OIDC token via the metadata server, so the api's runtime SA needs `roles/run.invoker` on the worker. Delivers in seconds.
2. Cloud Scheduler `outbox-sweep` every 5 min hitting `POST /drain?sweep=1`, which **also runs the workflow SLA scan**. This is the delivery guarantee if a ping is lost.

Deploy flags: `--min-instances 0`, CPU throttling left ON (bills only while draining), `--no-allow-unauthenticated` (required for the IAM auth to mean anything), plus the Cloud SQL connector.

> Cloud Scheduler is **not offered in `asia-southeast3`** - the `outbox-sweep` job lives in `asia-southeast1` and points at the worker URL. That is deliberate.

**`poll` (legacy always-on loop).**
Not used by any current environment.
A poller receives no HTTP traffic, so Cloud Run scales it to zero and throttles CPU outside requests - the loop stops and emails quietly stop sending.
If you ever run it, you MUST deploy with `--min-instances=1` and `--no-cpu-throttling`, which bills a full instance 24/7.
Prefer drain mode.

## Deploy (manual)

```powershell
$PROJECT = "my-easy-software-dev"
$REGION  = "asia-southeast3"
$ACCOUNT = "admin@myeasysoft.com"
# Reuses the API image - push it first via the deploy-api skill.
$IMAGE   = "asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-api:latest"

gcloud run deploy platform-api-outboxworker --image $IMAGE `
  --region $REGION --project $PROJECT --account $ACCOUNT `
  --command node --args outboxworker.js --quiet
```

Env vars, secrets, the Cloud SQL connector and the scale/auth flags all persist across image-only deploys, so a routine release is just the image.

> ⚠️ `--set-env-vars` REPLACES the whole plain env-var set. Use `--update-env-vars` to change one.

## Verify

```powershell
$ACCOUNT = "admin@myeasysoft.com"; $PROJECT = "my-easy-software-dev"

gcloud run services logs read platform-api-outboxworker --region asia-southeast3 `
  --project $PROJECT --account $ACCOUNT --limit 40

# Confirm drain-mode shape (scale-to-zero, NOT pinned to an instance):
gcloud run services describe platform-api-outboxworker --region asia-southeast3 `
  --project $PROJECT --account $ACCOUNT --format="yaml(spec.template.metadata.annotations)"
#   expect: autoscaling.knative.dev/minScale: '0'
```

End-to-end: trigger something that queues an email (a collaborator invitation, or forgot-password), then watch the ping-driven drain send it within a few seconds and the `OutboxMessage` flip to COMPLETED.
Dev was verified this way on 2026-08-01: `password.reset` delivered in 3s end to end, sweep returning 200.

## Gotchas
- **Emails not sending?** In order of likelihood: (a) the drain wiring is broken - `OUTBOX_WORKER_URL` missing on the **api**, or the api's SA lost `run.invoker` on the worker, so nothing ever pings it and only the 5-min sweep delivers; (b) the `outbox-sweep` scheduler job is paused or was created in the wrong region; (c) bad `EMAIL_PASS` (must be a Gmail App Password); (d) a tenant's per-company SMTP config is wrong - there is no fallback sender; (e) `FRONTEND_BASE_URL` unset on the **api**, so links are wrong even though delivery worked.
- **Worker code changes not appearing?** The image is shared with the API - build and push via `deploy-api` first, then redeploy this service, or it stays on the old image.
- **`SMTP_ENCRYPTION_KEY` must match the data's origin.** Dev's value is deliberately aligned to the old environment's because the copied `CompanySmtpConfigs` rows were encrypted with it; staging copied dev's for the same reason. A "fresh" key silently breaks tenant sending.
- Keep `DATABASE_URL` identical to the API's - same database, same outbox.
