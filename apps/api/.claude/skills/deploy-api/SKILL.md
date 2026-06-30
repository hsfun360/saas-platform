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
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | ⚙️ not needed today | RS256 keys. **Currently baked into the image** as `keys/private.pem` / `keys/public.pem` - `.dockerignore`'s `*.pem` only matches root-level files, so the `keys/` subdir IS copied in. So they are NOT env vars and you do NOT pass them at deploy. See **Hardening** to move them to Secret Manager. |
| `PORT` | auto | Cloud Run sets it; `server.js` reads `process.env.PORT`. |
| `RUN_SEED` | 🚫 never in prod | Gates the destructive wipe+reseed. Fresh/dev DB only, ad-hoc. |
| ~~`JWT_SECRET`~~ | ❌ unused | Not referenced anywhere (app is RS256, not HMAC). Harmless but drop it. |

> ⚠️ **`--set-env-vars` REPLACES the whole plain env-var set** - anything not listed is
> removed. Always pass the FULL set you want. (The JWT keys are image files today, not
> env vars, so they're unaffected and login keeps working across deploys.)

## Deploy (every release)

```powershell
$env:PROJECT_ID = "membership-project-199610"
$env:REGION     = "asia-southeast1"
$env:IMAGE_NAME = "login-api"
$FULL_TAG = "$($env:REGION)-docker.pkg.dev/$($env:PROJECT_ID)/$($env:IMAGE_NAME)/$($env:IMAGE_NAME):latest"

# 1. Build for Cloud Run (linux/amd64). Drop --no-cache for faster rebuilds.
docker build --platform linux/amd64 -t login-api-local:latest . --no-cache

# 2. Tag + push to Artifact Registry
docker tag login-api-local:latest $FULL_TAG
docker push $FULL_TAG

# 3. Deploy (pass the full env-var set; JWT keys come from the image).
gcloud run deploy $env:IMAGE_NAME `
  --image $FULL_TAG `
  --platform managed `
  --region $env:REGION `
  --allow-unauthenticated `
  --set-env-vars DATABASE_URL="postgres://postgres:<DB_PASSWORD_URLENCODED>@<DB_HOST>:<PORT>/<DB_NAME>" `
  --set-env-vars ADMIN_EMAILS="<admin1@example.com>" `
  --set-env-vars FRONTEND_BASE_URL="<https://your-frontend-url>"
```

> Use `--update-env-vars` to change ONE var without re-specifying the rest (it merges).

## Schema & data migrations
- **Schema columns auto-apply on boot** - `app.js` runs `sequelize.sync({ alter: true })`
  under an advisory lock, so new nullable columns (e.g. `Module.landingRoute`,
  `Role.description`) are added when the revision starts. No manual step.
- **Data migrations are manual**, run from a machine that can reach the DB
  (`DATABASE_URL` in `.env`), NOT part of the deploy. Run the one(s) a release needs, e.g.:
  ```powershell
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
from file: ...keys/private.pem`, and a DB connect. Then do a real **login** (exercises
JWT signing + DB). After a release that changed menu routes, **log out/in** so the
browser's cached `userMenus` refresh.

## Gotchas
- `JWT_SECRET` is dead - RS256 keys are what matter, and they come from the baked-in
  `keys/*.pem`. If login ever fails with `ENOENT .../keys/private.pem` or
  `secretOrPrivateKey`, the keys didn't make it into the image (check `.dockerignore`
  didn't start excluding `keys/`).
- The keys being in the image means anyone who can pull the image gets the signing
  key - acceptable for now, but see Hardening.
- DB SSL is commented out in `db.js` → plaintext to the external Postgres. Re-enable
  the `ssl` block if you move to Cloud SQL / require TLS.
- CORS `origin` is `'*'` in `app.js` - lock to the frontend URL before real prod.

## Hardening (optional - move JWT keys out of the image)
Better practice is to keep the signing key out of the registry:
```powershell
# 1. Create the secrets from the local keys (once)
gcloud secrets create JWT_PRIVATE_KEY --data-file=keys/private.pem
gcloud secrets create JWT_PUBLIC_KEY  --data-file=keys/public.pem
#    Grant the Cloud Run runtime service account roles/secretmanager.secretAccessor on both.
# 2. Stop baking keys in: add `keys/` to .dockerignore.
# 3. Add to every deploy: --set-secrets JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest,JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:latest
```
Do all three together (the `.dockerignore` change without the secrets would break login).
