---
name: deploy-api
description: Manually build, push and deploy the platform-api backend to Google Cloud Run (Artifact Registry image + gcloud run deploy), including the env/secret config, schema-sync behaviour, post-deploy data migrations, and verification. Use when asked to deploy the API, ship the backend, push a new Cloud Run revision, change API env vars or secrets, or release to an environment the pipeline does not cover.
---

# Deploy the platform API to Cloud Run

> **The pipeline is the normal path, not this runbook.**
> Pushing to `dev` builds and deploys worker -> api -> web automatically ([`docs/ops/cicd.md`](../../../docs/ops/cicd.md)), and staging is a manual "Promote to staging" run that redeploys the SAME digests.
> Use this skill only when the pipeline cannot do the job:
> - changing **env vars or secrets** (deliberately not managed by the pipeline),
> - deploying to an environment with no workflow yet (prod),
> - the pipeline is broken and a release cannot wait.
>
> A manual `:latest` deploy is self-healing: the promotion workflow resolves tags to digests before deploying staging.

Commands are **PowerShell** (the shell on this machine).
Never paste secret values into git or this file.

## Environments

| | dev | staging |
| --- | --- | --- |
| Project | `my-easy-software-dev` (number `855636431759`) | `my-easy-software-staging` (`640963543517`) |
| Region | `asia-southeast3` (Bangkok) | `asia-southeast3` |
| Service | `platform-api` | `platform-api` |
| URL | https://platform-api-855636431759.asia-southeast3.run.app | https://platform-api-640963543517.asia-southeast3.run.app |
| Registry | `asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps` | **the same one** - staging has no registry of its own |
| gcloud account | `admin@myeasysoft.com` | `admin@myeasysoft.com` |

Prod does not exist yet.
The old `membership-project-199610` / `asia-southeast1` / `login-api` environment was **decommissioned 2026-08-01** - none of those resources exist, do not deploy to them.

## What gets deployed
- **API service** (`platform-api`) - `apps/api/Dockerfile`, `CMD node server.js`. This runbook.
- **Outbox worker** (`platform-api-outboxworker`) reuses the SAME image with the command overridden. Separate service, see the `deploy-worker` skill. Standing convention: **deploy the worker BEFORE the api**, so outbox/template changes are live in the sender before producers write them.

## Prerequisites
- **Docker Desktop RUNNING** (`docker info` succeeds).
- `admin@myeasysoft.com` authenticated. The DEFAULT gcloud account on this machine is `hsfun360@gmail.com`, which has **no access** to the dev/staging projects, so every command below passes `--account`.
  If a command fails with `Reauthentication failed. cannot prompt during non-interactive execution`, the token expired - the user must run `gcloud auth login admin@myeasysoft.com` interactively.
- One-time per machine: `gcloud auth configure-docker asia-southeast3-docker.pkg.dev`.

## Deploy (manual)

```powershell
$PROJECT  = "my-easy-software-dev"
$REGION   = "asia-southeast3"
$ACCOUNT  = "admin@myeasysoft.com"
$REGISTRY = "asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps"
$TAG      = "$REGISTRY/platform-api:latest"

# 1. Build for Cloud Run. --platform linux/amd64 is REQUIRED on this machine
#    (the CI runner is already amd64, which is why the workflow omits it).
#    Run from the repo root - the api Dockerfile lives in apps/api.
docker build --platform linux/amd64 -t $TAG apps/api

# 2. Push. The docker credential helper follows the ACTIVE gcloud account, NOT
#    --account, so the active account must be the one with registry access.
gcloud config set account $ACCOUNT
docker push $TAG
gcloud config set account hsfun360@gmail.com   # restore the default

# 3. Deploy the worker FIRST, then the api (see convention above).
gcloud run deploy platform-api-outboxworker --image $TAG --region $REGION --project $PROJECT --account $ACCOUNT --quiet
gcloud run deploy platform-api --image $TAG --region $REGION --project $PROJECT --account $ACCOUNT --allow-unauthenticated
```

> ⚠️ **`--set-env-vars` REPLACES the whole plain env-var set** - anything not listed is removed.
> Use `--update-env-vars` to change one var, and `--remove-env-vars` to drop one.
> **Secret-backed vars (`--update-secrets`) are a SEPARATE set and persist across deploys**, so an image-only deploy keeps them attached. Never ship a revision without the JWT secrets - every login 500s.

## Runtime config

Already attached to dev; listed so a new environment can be wired from scratch.

| Var | Kind | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | secret | Postgres. Dev uses the Cloud SQL connector (`--add-cloudsql-instances`) over a unix socket: the URL carries `?host=/cloudsql/my-easy-software-dev:asia-southeast3:platform-db-dev` (Sequelize v6 honours the `host` query param for socket paths). |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | secret | RS256 keys. NOT in the image (`keys/` is `.dockerignore`d), so they MUST be attached. `src/platform/jwt.keys.js` reads env first, falling back to a local `keys/` file for dev only. Staging has its OWN fresh keypair. |
| `SMTP_ENCRYPTION_KEY` | secret | Decrypts per-company SMTP passwords. **Must match whatever environment the data was copied from** - a fresh key cannot decrypt existing `CompanySmtpConfigs` rows. |
| `GOOGLE_CLIENT_SECRET` | secret | Google sign-in code exchange. |
| `ADMIN_EMAILS` | plain | Break-glass System Admin allowlist + seed owner. Dev: `admin@myeasysoft.com`. |
| `FRONTEND_BASE_URL` | plain | Base URL in invitation / reset emails. Must point at the WEB service, never the API host. |
| `ASSETS_BUCKET` | plain | Per-environment GCS bucket for public image uploads (avatars, logos). Dev: `my-easy-software-dev-app-assets`. Needs `allUsers` objectViewer + the runtime SA objectAdmin. Uploads 500 with a clear message when unset - **each new environment needs its own bucket and value**. |
| `GOOGLE_CLIENT_ID` | plain | Per-environment OAuth client; read by the login screen via `GET /api/auth/sso-config`. |
| `MICROSOFT_SSO_ENABLED` | plain | `false` outside prod - hides the button. |
| `OUTBOX_WORKER_URL` | plain | Worker URL for the post-commit drain ping. See `deploy-worker`. |
| `PORT` | auto | Set by Cloud Run; `server.js` reads it. |
| `RUN_SEED` | 🚫 never | Gates a destructive wipe+reseed, and it fires on EVERY cold start while set. Used once on a fresh DB, then removed. |

## Schema & data migrations

- **Schema changes auto-apply on boot.** `app.js` runs `sequelize.sync({ alter: true })` under an advisory lock.
- **Fingerprint gate:** boot hashes the model definitions (`src/platform/schemaFingerprint.js`) against the one-row `public."SchemaMeta"` table. Match -> `Database schema up to date (fingerprint match) - skipping sync.` and the instance is ready in seconds. Mismatch -> the full sync runs once, then the fingerprint is updated. Expect the slow `Database schema synced successfully.` only on the FIRST boot after a model-changing release.
- **Escape hatch:** after manual DDL outside the models, deploy once with `--update-env-vars FORCE_SCHEMA_SYNC=1`, then `--remove-env-vars FORCE_SCHEMA_SYNC`.
- **Destructive DDL (renames, drops, NOT NULL backfills) must run BEFORE the sync sees it** - the pattern is an idempotent guarded block at the top of `initializeDB()` in `app.js`, keyed on `to_regclass` / `information_schema` so a fresh DB skips it.
- **Data migrations are manual** and are NOT part of the deploy. Run them from `apps/api` (where `package.json` lives) on a machine that can reach the DB:
  ```powershell
  cd apps/api
  npm run migrate:menu-routes -- --dry-run   # preview
  npm run migrate:menu-routes                # apply (idempotent)
  ```
  ⚠️ `apps/api/.env` may still point `DATABASE_URL` at the retired external Postgres (`20.212.81.135`). **Check it before running anything** or the migration silently targets the wrong database.
- **Fresh/empty DB only:** `npm run seed` (destructive).
- One-off DB scripts run as the `seed-users` Cloud Run Job (`scripts/` is `.dockerignore`d, so it cannot be a container command) - see [`docs/ops/dev-environment.md`](../../../docs/ops/dev-environment.md).

## Verify

**A 200 on `/` does NOT mean the deploy is healthy.** `start()` calls `app.listen` and only then kicks off `initializeDB()` in the background (`src/app.js`), so the service serves traffic whether or not the schema sync succeeded. The pipeline's smoke check has the same blind spot. Always read the logs after a model-changing release.

```powershell
$ACCOUNT = "admin@myeasysoft.com"; $PROJECT = "my-easy-software-dev"
curl "https://platform-api-855636431759.asia-southeast3.run.app/"     # -> "Login API is running!"

# The real check - schema sync outcome and any boot error:
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="platform-api"' `
  --project $PROJECT --account $ACCOUNT --limit 50 --freshness 15m --format="value(timestamp,severity,textPayload)"

# Env var NAMES only (never prints values):
gcloud run services describe platform-api --region asia-southeast3 --project $PROJECT --account $ACCOUNT `
  --format="value(spec.template.spec.containers[0].env[].name)"
```

Confirm in the logs: `PostgreSQL connection established successfully.`, then either the fingerprint-skip line or `Database schema synced successfully.`, and **no error from a guarded migration block**.

> ⏱️ **Do not verify DATA until `Database schema synced successfully.` has printed.** On a model-changing release the alter-sync takes MINUTES (~4 min observed on dev, 2026-08-27), and the service serves traffic throughout - Sequelize creates the new tables early in the pass, so a new table reads as EMPTY and a post-sync backfill has not run yet. Querying in that window looks exactly like a failed migration and has already sent one debugging session chasing a bug that did not exist.
Then do a real **login** - it exercises JWT signing, and `[JWT KEYS] Loaded private key from environment variable.` only prints on the first token op, so it appears after that login rather than at boot.
After a release that changed menu routes, **log out and back in** so the browser's cached `userMenus` refresh.

## Gotchas
- **The credential helper ignores `--account`.** Pushing while `hsfun360@gmail.com` is active fails with a permissions error even though every `gcloud` flag looks right. Switch the active account for the push, then switch back.
- **`JWT_SECRET` is dead** (the app is RS256, not HMAC). If login fails with `ENOENT .../keys/private.pem` or `secretOrPrivateKey`, the RS256 secrets are not attached to the revision - re-attach with `--update-secrets` and confirm the runtime SA has `roles/secretmanager.secretAccessor`.
- **Cloud Scheduler is not available in `asia-southeast3`.** Jobs that drive this environment live in `asia-southeast1`; that is deliberate, not a misconfiguration.
- **Most tables are singular** (`public."User"`, `public."Account"`); only a few are plural (`Modules`, `Menus`, `Roles`, `RoleMenus`). Check names before writing verification queries.
