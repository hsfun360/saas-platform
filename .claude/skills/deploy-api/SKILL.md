---
name: deploy-api
description: Build, push and deploy the LoginAPI backend to Google Cloud Run (Artifact Registry image + gcloud run deploy), including the required env/secret config, post-deploy data migrations, and verification. Use when asked to deploy the API, ship the backend, push a new Cloud Run revision, or release LoginAPI.
---

# Deploy LoginAPI to Cloud Run

A runbook for shipping the `login-api` backend. Commands are **PowerShell** (the
shell used on this machine). Never put real secrets (DB password, JWT keys) in the
command line, in git, or in this file — use Secret Manager. Placeholders look like
`<DB_PASSWORD>`.

## What gets deployed
- **API service** (`login-api`) — `Dockerfile` → `CMD node server.js`. This runbook.
- **Outbox worker** (email sender) is a **separate** service (`outboxworker.js`,
  needs `EMAIL_USER`/`EMAIL_PASS`). Not covered here — deploy it on its own.

## Required runtime config (Cloud Run)

| Var | Required | Purpose | How to set |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string (URL-encode the password: `@`→`%40`) | env or secret |
| `JWT_PRIVATE_KEY` | ✅ | RS256 **signing** key (PEM). App reads this env var; falls back to `keys/private.pem` which is **NOT in the image** (`.dockerignore` excludes `*.pem`). | **Secret Manager** |
| `JWT_PUBLIC_KEY` | ✅ | RS256 **verify** key (PEM). Same as above. | **Secret Manager** |
| `ADMIN_EMAILS` | ✅ | Break-glass System Admin allowlist + seed owner (comma-separated) | env |
| `FRONTEND_BASE_URL` | ⚠️ recommended | Base URL used in invitation / reset emails | env |
| `PORT` | auto | Cloud Run sets it; `server.js` already reads `process.env.PORT` | — |
| `RUN_SEED` | 🚫 never in prod | Gates the **destructive** wipe+reseed. Only for a fresh/dev DB, run ad-hoc. | — |
| ~~`JWT_SECRET`~~ | ❌ unused | **Not referenced anywhere** — the app is RS256, not HMAC. Do not set it. | — |

> ⚠️ **`gcloud run deploy --set-env-vars` REPLACES the entire plain env-var set** —
> any plain env var not listed is removed. Secrets set via `--set-secrets` live in a
> separate collection and survive. So the JWT keys MUST be Secret Manager mounts
> (or they'd be wiped each deploy → first login crashes reading a missing
> `keys/private.pem`). Always pass `--set-secrets` and the full `--set-env-vars` set
> together so each deploy is reproducible.

## One-time setup (skip if already done)

```powershell
$env:PROJECT_ID = "membership-project-199610"
$env:REGION     = "asia-southeast1"
$env:IMAGE_NAME = "login-api"

# Artifact Registry repo (once)
gcloud artifacts repositories create $env:IMAGE_NAME `
  --repository-format=docker --location=$env:REGION

# Let Docker push to Artifact Registry (once per machine)
gcloud auth configure-docker "$($env:REGION)-docker.pkg.dev"

# JWT keys as secrets (once; from the local keys/ dir). Rotate by adding versions.
gcloud secrets create JWT_PRIVATE_KEY --data-file=keys/private.pem
gcloud secrets create JWT_PUBLIC_KEY  --data-file=keys/public.pem
# Grant the Cloud Run runtime service account access to read them:
#   roles/secretmanager.secretAccessor on both secrets.
```

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

# 3. Deploy. Sets ALL plain env vars (replace-all) + mounts JWT keys from secrets.
gcloud run deploy $env:IMAGE_NAME `
  --image $FULL_TAG `
  --platform managed `
  --region $env:REGION `
  --allow-unauthenticated `
  --set-env-vars DATABASE_URL="postgres://postgres:<DB_PASSWORD_URLENCODED>@<DB_HOST>:<PORT>/<DB_NAME>" `
  --set-env-vars ADMIN_EMAILS="<admin1@example.com>" `
  --set-env-vars FRONTEND_BASE_URL="<https://your-frontend-url>" `
  --set-secrets JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest,JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:latest
```

> Use `--update-env-vars` instead of `--set-env-vars` if you want to change ONE var
> without re-specifying the rest (it merges instead of replacing).

## Schema & data migrations

- **Schema columns auto-apply on boot.** `app.js` runs `sequelize.sync({ alter: true })`
  under an advisory lock, so new nullable columns (e.g. `Module.landingRoute`,
  `Role.description`) are added automatically when the new revision starts. No manual step.
- **Data migrations are manual** and run from a machine that can reach the DB
  (`DATABASE_URL` in `.env`). They are NOT part of the deploy. Run the one(s) a given
  release calls for, e.g. the route-namespace rename:
  ```powershell
  npm run migrate:menu-routes -- --dry-run   # preview
  npm run migrate:menu-routes                # apply (idempotent)
  ```
- **Fresh/empty DB only:** `npm run seed` (destructive — wipes Roles/Menus/Modules).
  Never against a populated production DB.

## Verify

```powershell
# Health check (should print "Login API is running!")
curl "https://<your-cloud-run-url>/"

# Inspect the live revision's env + secrets
gcloud run services describe $env:IMAGE_NAME --region $env:REGION `
  --format="yaml(spec.template.spec.containers[0].env)"

# Tail logs for boot errors (schema sync, key loading, DB connect)
gcloud run services logs read $env:IMAGE_NAME --region $env:REGION --limit 50
```

Confirm in logs: `Database schema synced successfully`, `[JWT KEYS] Loaded
private key from environment variable.`, and a successful DB connect. Then do a real
**login** — it exercises JWT signing (keys) + DB. After a release that changed menu
routes, **log out/in** so the cached `userMenus` in the browser refresh.

## Gotchas
- `JWT_SECRET` is dead — RS256 keys are what matter. Missing/wiped keys don't fail
  boot; they fail the **first login** (lazy key load → ENOENT/`secretOrPrivateKey`).
- `*.pem` is `.dockerignore`d, so keys are never in the image — they must come from
  env/secrets at runtime.
- DB SSL is currently commented out in `db.js`, so traffic to the external Postgres
  is plaintext. If you move to Cloud SQL or require TLS, re-enable the `ssl` block.
- CORS `origin` is `'*'` in `app.js` — lock it to the frontend URL before real prod.
