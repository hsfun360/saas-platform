---
name: deploy-web
description: Build, push and deploy the Angular frontend (login-web) to Google Cloud Run (Artifact Registry image + gcloud run deploy), including the nginx/SPA setup, the production-budget gotcha, verification, and keeping the backend's FRONTEND_BASE_URL in sync. Use when asked to deploy the frontend, ship the web app, push a new login-web revision, or release the Login UI.
---

# Deploy the Login frontend to Cloud Run

Runbook for shipping the Angular SPA as the `login-web` Cloud Run service.
Commands are **PowerShell** (the shell on this machine).

Known-good config (verified 2026-06-26): project `membership-project-199610`,
region `asia-southeast1`, account `hsfun360@gmail.com`.
- Frontend service: **`login-web`** → https://login-web-148523901156.asia-southeast1.run.app
- Backend service: `login-api` → https://login-api-148523901156.asia-southeast1.run.app

## How it's built
Multi-stage `Dockerfile`: **Node build → nginx serve**.
- `npm run build -- --configuration production` (Angular `@angular/build:application`)
  emits static files to **`dist/Login/browser`**.
- `nginx.conf` is copied to `/etc/nginx/templates/default.conf.template`; the nginx
  image's envsubst step expands **`${PORT}`** at startup (Cloud Run sets PORT=8080),
  serves `/usr/share/nginx/html`, and does **SPA fallback** (`try_files … /index.html`)
  so deep links like `/admin/roles`, `/golf` return 200 on refresh.
- **The API URL is baked into the image** from `src/environments/environment.ts`
  (`apiUrl`). There are NO runtime env vars. To repoint at a different API, edit
  `environment.ts` and rebuild.

## Prerequisites (check before every deploy)
- **Docker Desktop RUNNING** (`docker info` succeeds).
- gcloud authenticated on `membership-project-199610`.
- One-time per machine: `gcloud auth configure-docker asia-southeast1-docker.pkg.dev`.
- One-time: Artifact Registry repo exists -
  `gcloud artifacts repositories create login-web --repository-format=docker --location=asia-southeast1`.

## Deploy (every release)
```powershell
$env:PROJECT_ID = "membership-project-199610"
$env:REGION     = "asia-southeast1"
$FULL_TAG = "$($env:REGION)-docker.pkg.dev/$($env:PROJECT_ID)/login-web/login-web:latest"

# From the Login/ project root (where the Dockerfile is):
docker build --platform linux/amd64 -t login-web-local:latest .
docker tag login-web-local:latest $FULL_TAG
docker push $FULL_TAG

# No env vars - static SPA; Cloud Run provides PORT.
gcloud run deploy login-web `
  --image $FULL_TAG `
  --platform managed `
  --region $env:REGION `
  --allow-unauthenticated
```

## Keep the backend's FRONTEND_BASE_URL in sync
The backend (`login-api`) uses `FRONTEND_BASE_URL` for invitation / password-reset
email links. The `login-web` URL is **stable** for a given service+region+project,
so this is normally a **one-time** step (already done). Only re-run if the URL
changes - and use `--update-env-vars` so the backend's other vars (DATABASE_URL,
ADMIN_EMAILS) are preserved:
```powershell
gcloud run services update login-api --region asia-southeast1 `
  --update-env-vars FRONTEND_BASE_URL=https://login-web-148523901156.asia-southeast1.run.app
```

## Verify
```powershell
$base = "https://login-web-148523901156.asia-southeast1.run.app"
(Invoke-WebRequest "$base/"            -UseBasicParsing).StatusCode   # 200, page has <app-root>
(Invoke-WebRequest "$base/admin/roles" -UseBasicParsing).StatusCode   # 200 (SPA fallback, NOT 404)
gcloud run services logs read login-web --region asia-southeast1 --limit 30
```
Then open the URL and do a real login (the SPA calls the baked-in API URL). After a
release that changed menu routes, **log out/in** so the cached `userMenus` refresh.

## Google SSO - register the live origin (one-time per URL)
"Sign in with Google" uses the GIS **token model** (`initTokenClient` in
`src/app/login/login.ts`, client_id `148523901156-uc6a3f7q2le2fsqbm5idc0ai27vebe69`),
which validates the page's **JavaScript origin** against the OAuth client. A freshly
deployed Cloud Run URL is not on that list → login fails with **`Error 400:
origin_mismatch`** ("register the JavaScript origin").

Fix (Google Cloud Console, can't be done via gcloud): **APIs & Services → Credentials
→** the OAuth 2.0 Client ID ending `…uc6a3f7q2le2fsqbm5idc0ai27vebe69` → **Authorized
JavaScript origins → Add URI**:
```
https://login-web-148523901156.asia-southeast1.run.app
```
- Edit the **existing** client - do NOT create a new OAuth client (a new client ID
  won't match the one baked into the code).
- Put it under **Authorized JavaScript origins**, not "Authorized redirect URIs"
  (the token model has no redirect).
- Use the **exact URL in the browser's address bar**, no trailing slash / no path.
  Cloud Run serves the service under more than one host (the project-number form
  above **and** a hash form like `https://login-web-iqbkpf5usq-as.a.run.app` -
  `gcloud run services describe login-web --region asia-southeast1 --format="value(status.url)"`
  prints the hash one). Register whichever origin you actually browse to; add both to
  be safe. Keep `http://localhost:4200` for dev.
- Changes take ~5 min to a few hours to propagate; retry in an Incognito window.

## Gotchas
- **Production budgets are stricter than dev.** `ng build --configuration production`
  fails if a component style exceeds the `anyComponentStyle` error budget (the shell
  `dashboard.css` hit this). The dev builds run all session don't enforce it. Fix:
  raise the budgets in `angular.json` (`configurations.production.budgets`) - currently
  `anyComponentStyle` 12/24 kB and `initial` 1/2 MB - or trim the CSS. A failing
  `RUN npm run build` in the Docker build is almost always this.
- **API URL is compile-time**, not a runtime env var - change `environment.ts` + rebuild.
- nginx must listen on `${PORT}` (don't hardcode 80) and must SPA-fallback to
  `index.html`, or Cloud Run health checks / deep links break.
- `index.html` is served `no-cache` (hashed JS/CSS are cached 1y) so a new deploy is
  visible immediately without a hard refresh.
- `.dockerignore` keeps `node_modules`/`dist`/`.git` out of the build context - keep it.
