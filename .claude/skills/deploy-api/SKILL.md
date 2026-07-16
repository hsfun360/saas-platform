---
name: deploy-api
description: Build, push and deploy the LoginAPI backend to Google Cloud Run (Artifact Registry image + gcloud run deploy), including the required env config, post-deploy data migrations, and verification. Use when asked to deploy the API, ship the backend, push a new Cloud Run revision, or release LoginAPI.
---

# Deploy LoginAPI to Cloud Run

A runbook for shipping the `login-api` backend. Commands are **PowerShell** (the
shell on this machine). Don't paste new secrets into git or this file.

Known-good config (verified 2026-06-25): project `membership-project-199610`,
region `asia-southeast1`, account `hsfun360@gmail.com`. The live service runs with
plain env vars `DATABASE_URL`, `ADMIN_EMAILS` (and a no-op `JWT_SECRET`).

## What gets deployed
- **API service** (`login-api`) - `Dockerfile` → `CMD node server.js`. This runbook.
- **Outbox worker** (email sender) is a **separate** service (`outboxworker.js`,
  needs `EMAIL_USER`/`EMAIL_PASS`). Not covered here.

## Prerequisites (check before every deploy)
- **Docker Desktop must be RUNNING** (`docker info` must succeed) - the build needs the
  Linux engine daemon. If `docker info` errors with "failed to connect... dockerDesktopLinuxEngine",
  start Docker Desktop and wait for it to be ready.
- gcloud authenticated (`gcloud auth list`) on project `membership-project-199610`.
- One-time per machine: `gcloud auth configure-docker asia-southeast1-docker.pkg.dev`
  and the Artifact Registry repo exists (`gcloud artifacts repositories create login-api
  --repository-format=docker --location=asia-southeast1`).

## Runtime config (Cloud Run)

| Var | Status | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ required | Postgres connection (URL-encode the password: `@`→`%40`). |
| `ADMIN_EMAILS` | ✅ required | Break-glass System Admin allowlist + seed owner (comma-separated). |
| `FRONTEND_BASE_URL` | ⚠️ recommended | Base URL used in invitation / reset emails. |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | ✅ required (secret) | RS256 keys, now in **Secret Manager** (secrets `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`), injected as env vars via `--update-secrets` (see below). NO longer baked into the image (`keys/` is `.dockerignore`d). `src/platform/jwt.keys.js` reads them from `process.env` first, falling back to a local `keys/` file for dev only. |
| `PORT` | auto | Cloud Run sets it; `server.js` reads `process.env.PORT`. |
| `RUN_SEED` | 🚫 never in prod | Gates the destructive wipe+reseed. Fresh/dev DB only, ad-hoc. |
| ~~`JWT_SECRET`~~ | ❌ unused | Not referenced anywhere (app is RS256, not HMAC). Harmless but drop it. |

> ⚠️ **`--set-env-vars` REPLACES the whole plain env-var set** - anything not listed is
> removed. Always pass the FULL set you want. **Secret-backed vars (`--update-secrets`)
> are a SEPARATE set and persist across deploys**, so a plain `gcloud run deploy --image`
> keeps the JWT secrets attached - you only pass `--update-secrets` when (re)wiring them.
> Since login now depends on these secrets, NEVER ship an image without them attached.

## Deploy (every release)

```powershell
$env:PROJECT_ID = "membership-project-199610"
$env:REGION     = "asia-southeast1"
$env:IMAGE_NAME = "login-api"
$FULL_TAG = "$($env:REGION)-docker.pkg.dev/$($env:PROJECT_ID)/$($env:IMAGE_NAME)/$($env:IMAGE_NAME):latest"

# 1. Build for Cloud Run (linux/amd64). Drop --no-cache for faster rebuilds.
#    Run from the saas-platform repo root (the api Dockerfile lives in apps/api).
docker build --platform linux/amd64 -t login-api-local:latest apps/api --no-cache

# 2. Tag + push to Artifact Registry
docker tag login-api-local:latest $FULL_TAG
docker push $FULL_TAG

# 3. Deploy. Plain env vars + secret-backed JWT keys both persist across deploys,
#    so a routine release is just the image - no env/secret flags needed:
gcloud run deploy $env:IMAGE_NAME `
  --image $FULL_TAG `
  --platform managed `
  --region $env:REGION `
  --allow-unauthenticated
```

> Use `--update-env-vars` to change ONE plain var without re-specifying the rest (it merges),
> and `--update-secrets JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest --update-secrets JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:latest`
> to (re)attach the JWT secrets. One-time setup of those secrets is in **JWT keys (Secret Manager)** below.
> If you ever change plain vars with `--set-env-vars` (which REPLACES the plain set), it does NOT
> touch the secret set - the JWT keys stay attached.

## Schema & data migrations
- **Schema columns auto-apply on boot** - `app.js` runs `sequelize.sync({ alter: true })`
  under an advisory lock, so new nullable columns (e.g. `Module.landingRoute`,
  `Role.description`) are added when the revision starts. No manual step.
- **Fingerprint gate (2026-07-16):** the sync is SKIPPED when nothing changed.
  Boot hashes the model definitions (`src/platform/schemaFingerprint.js`) and
  compares against the one-row `public."SchemaMeta"` table: match → log
  `Database schema up to date (fingerprint match) - skipping sync.` and the
  instance is ready in seconds; mismatch (a release edited a model) → full sync
  runs once, then the fingerprint is updated. So expect the multi-minute
  `Database schema synced successfully.` only on the FIRST boot after a
  model-changing release - scale-ups/cold starts/no-op deploys skip.
- **Escape hatch:** if the DB was changed manually (dropped/altered outside the
  models) and you need a full re-sync despite an unchanged fingerprint, deploy
  once with `--update-env-vars FORCE_SCHEMA_SYNC=1`, then remove it
  (`--remove-env-vars FORCE_SCHEMA_SYNC`) so later boots go back to skipping.
- **Data migrations are manual**, run from a machine that can reach the DB
  (`DATABASE_URL` in `apps/api/.env`), NOT part of the deploy. Run them from the
  `apps/api` folder (that is where `package.json` and the scripts live). Run the
  one(s) a release needs, e.g.:
  ```powershell
  cd apps/api
  npm run migrate:menu-routes -- --dry-run   # preview
  npm run migrate:menu-routes                # apply (idempotent)
  ```
- **Fresh/empty DB only:** `npm run seed` (destructive). Never on a populated prod DB.

## Verify
```powershell
curl "https://<your-cloud-run-url>/"          # -> "Login API is running!"
gcloud run services describe login-api --region asia-southeast1 `
  --format="value(spec.template.spec.containers[0].env[].name)"   # env var names (no values)
gcloud run services logs read login-api --region asia-southeast1 --limit 50
```
Confirm in logs: `Database schema synced successfully`, `[JWT KEYS] Loaded private key
from environment variable.`, and a DB connect. Then do a real **login** (exercises
JWT signing + DB - the "from environment variable" line only prints on the first token
op, so it appears after that login, not at boot). After a release that changed menu
routes, **log out/in** so the browser's cached `userMenus` refresh.

## Gotchas
- `JWT_SECRET` is dead - RS256 keys are what matter. They now come from **Secret Manager**
  (env vars `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`), NOT the image. If login fails with
  `ENOENT .../keys/private.pem` or `secretOrPrivateKey`, the secrets aren't attached to the
  revision - re-attach with `--update-secrets` (see below) and confirm the runtime SA has
  `roles/secretmanager.secretAccessor`. (`keys/` is `.dockerignore`d, so there is no file
  fallback in the image - the secrets MUST be attached.)
- DB SSL is commented out in `db.js` → plaintext to the external Postgres. Re-enable
  the `ssl` block if you move to Cloud SQL / require TLS.
- CORS `origin` is `'*'` in `app.js` - lock to the frontend URL before real prod.

## JWT keys (Secret Manager) - one-time setup
Done for `membership-project-199610` (2026-07-01); repeat only for a new project/env.
Keys are kept out of the registry and injected as env vars, so the app stays
platform-agnostic (`src/platform/jwt.keys.js` reads `process.env.JWT_PRIVATE_KEY` first).
```powershell
gcloud services enable secretmanager.googleapis.com
# 1. Create the secrets from the local keys (once)
gcloud secrets create JWT_PRIVATE_KEY --data-file="apps/api/keys/private.pem" --replication-policy="automatic"
gcloud secrets create JWT_PUBLIC_KEY  --data-file="apps/api/keys/public.pem"  --replication-policy="automatic"
# 2. Grant the Cloud Run runtime service account read access
$SA = "148523901156-compute@developer.gserviceaccount.com"   # PROJECT_NUMBER-compute@developer.gserviceaccount.com
gcloud secrets add-iam-policy-binding JWT_PRIVATE_KEY --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding JWT_PUBLIC_KEY  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
# 3. Attach to the service (persists across future deploys)
gcloud run services update login-api --region asia-southeast1 `
  --update-secrets "JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest" --update-secrets "JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:latest"
```
To rotate a key: `gcloud secrets versions add JWT_PRIVATE_KEY --data-file=...` then redeploy
(new tokens use the new key; keep the old version until all old tokens expire). The local
`apps/api/keys/*.pem` are for dev only and must stay git-ignored - never commit them.
