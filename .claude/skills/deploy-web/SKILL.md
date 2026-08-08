---
name: deploy-web
description: Manually build, push and deploy the Angular frontend (platform-web) to Google Cloud Run (Artifact Registry image + gcloud run deploy), including the nginx SPA + /api reverse-proxy setup, the API_HOST runtime var, the production-budget gotcha, Google SSO origin registration, and verification. Use when asked to deploy the frontend, ship the web app, push a new platform-web revision, or repoint the app at a different API.
---

# Deploy the platform frontend to Cloud Run

> **The pipeline is the normal path, not this runbook.**
> Pushing to `dev` builds and deploys worker -> api -> web automatically ([`docs/ops/cicd.md`](../../../docs/ops/cicd.md)), and staging is a manual "Promote to staging" run of the same digests.
> Use this skill only for env-var changes (`API_HOST`), an environment with no workflow yet (prod), or when the pipeline is broken.

Commands are **PowerShell** (the shell on this machine).

## Environments

| | dev | staging |
| --- | --- | --- |
| Project | `my-easy-software-dev` (`855636431759`) | `my-easy-software-staging` (`640963543517`) |
| Region | `asia-southeast3` | `asia-southeast3` |
| Service | `platform-web` | `platform-web` |
| URL | https://platform-web-855636431759.asia-southeast3.run.app | https://platform-web-640963543517.asia-southeast3.run.app |
| Registry | `asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps` | **the same one** |
| `API_HOST` | `platform-api-855636431759.asia-southeast3.run.app` | `platform-api-640963543517.asia-southeast3.run.app` |

The old `membership-project-199610` / `asia-southeast1` / `login-web` environment was **decommissioned 2026-08-01**.

## How it's built

Multi-stage `apps/web/Dockerfile`: **Node build -> nginx serve**.

- `npm run build -- --configuration production` emits static files to **`dist/Login/browser`**.
- `nginx.conf` is copied to `/etc/nginx/templates/default.conf.template`; the nginx image's envsubst step expands **`${PORT}`** and **`${API_HOST}`** at container start.
- **SPA fallback** (`try_files … /index.html`) so deep links like `/admin/roles` return 200 on refresh.

### The API URL is same-origin, not baked in

`environment.ts` sets `apiUrl: '/api'` (relative).
The app never names an API host - it calls `/api` on its own origin, and something in front resolves it:

- **dev / staging:** nginx reverse-proxies `/api/*` to `https://${API_HOST}` (`nginx.conf:31-37`). This is why `API_HOST` is a **runtime env var** on the service, and how these environments get same-origin cookie/CORS behaviour with no load balancer.
- **future prod:** the load balancer answers `/api/*` before traffic reaches nginx, so the nginx location is dormant there.

To repoint the app at a different API, set `API_HOST` - **no rebuild needed**:
```powershell
gcloud run services update platform-web --region asia-southeast3 --project my-easy-software-dev `
  --account admin@myeasysoft.com --update-env-vars API_HOST=<api-host-without-scheme>
```

> ⚠️ `apps/web/Dockerfile` still defaults `ENV API_HOST=login-api-148523901156.asia-southeast1.run.app` - a service **deleted on 2026-08-01**.
> Dev and staging override it, so they are fine, but a NEW environment that forgets the override will silently proxy `/api` to a dead host.
> Always set `API_HOST` explicitly when standing up an environment.

## Prerequisites
- **Docker Desktop RUNNING** (`docker info` succeeds).
- `admin@myeasysoft.com` authenticated; the default account (`hsfun360@gmail.com`) has no access to these projects.
- One-time per machine: `gcloud auth configure-docker asia-southeast3-docker.pkg.dev`.

## Deploy (manual)

```powershell
$PROJECT  = "my-easy-software-dev"
$REGION   = "asia-southeast3"
$ACCOUNT  = "admin@myeasysoft.com"
$TAG      = "asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-web:latest"

# From the repo root - the web Dockerfile lives in apps/web.
# --platform linux/amd64 is REQUIRED here (the CI runner is already amd64).
docker build --platform linux/amd64 -t $TAG apps/web

# The docker credential helper follows the ACTIVE gcloud account, not --account.
gcloud config set account $ACCOUNT
docker push $TAG
gcloud config set account hsfun360@gmail.com   # restore the default

gcloud run deploy platform-web --image $TAG --region $REGION --project $PROJECT `
  --account $ACCOUNT --allow-unauthenticated
```

`API_HOST` persists across image-only deploys - only pass `--update-env-vars` when changing it.

## Keep the backend's FRONTEND_BASE_URL in sync

The API uses `FRONTEND_BASE_URL` for invitation / password-reset email links, and it must point at the WEB service.
The URL is stable for a given service+region+project, so this is normally a one-time step per environment (already done for dev and staging).
Use `--update-env-vars` so the API's other vars survive:

```powershell
gcloud run services update platform-api --region asia-southeast3 --project my-easy-software-dev `
  --account admin@myeasysoft.com `
  --update-env-vars FRONTEND_BASE_URL=https://platform-web-855636431759.asia-southeast3.run.app
```

## Verify

```powershell
$base = "https://platform-web-855636431759.asia-southeast3.run.app"
curl -s -o /dev/null -w "%{http_code}`n" "$base/"                      # 200, page has <app-root>
curl -s -o /dev/null -w "%{http_code}`n" "$base/admin/roles"           # 200 via SPA fallback, NOT 404
curl -s "$base/api/auth/sso-config"                                    # proves the /api proxy reaches the API
```

The third check is the important one: it exercises the nginx `/api` proxy end to end, which is exactly what the pipeline's smoke check asserts.
Then open the URL and do a real login.
After a release that changed menu routes, **log out and back in** so the cached `userMenus` refresh.

## Google SSO - register the origin (one-time per URL)

Sign-in validates the page's **JavaScript origin** against the OAuth client, so a new Cloud Run URL fails with **`Error 400: origin_mismatch`** until registered.
Each environment has its OWN client (dev: `855636431759-7dktsf4ls0iq5h6e5gsu9abeeo8gd5q6`; the client ID reaches the app as the API's `GOOGLE_CLIENT_ID`, surfaced via `GET /api/auth/sso-config`).
Staging has no client configured yet.

In the Google Cloud Console (not doable via gcloud) for the environment's project: **APIs & Services -> Credentials -> the OAuth 2.0 Client ID -> Authorized JavaScript origins -> Add URI**, plus the redirect URI `<origin>/login`.

- Edit the **existing** client for that environment; do not create a new one.
- Use the **exact URL in the browser's address bar**, no trailing slash, no path. Cloud Run serves the service under more than one host (the project-number form above **and** a hash form) - `gcloud run services describe platform-web --region asia-southeast3 --format="value(status.url)"` prints the one to register. Add both to be safe, and keep `http://localhost:4200` for dev.
- Changes take ~5 minutes to a few hours to propagate; retry in an Incognito window.

## Gotchas
- **Production budgets are stricter than dev.** `ng build --configuration production` fails if a component style exceeds the `anyComponentStyle` error budget (the shell `dashboard.css` hit this once). Session dev builds do not enforce it. A failing `RUN npm run build` inside the Docker build is almost always this - raise the budgets in `angular.json` (`configurations.production.budgets`) or trim the CSS.
- **The credential helper ignores `--account`** - switch the active account for the push, then switch back.
- nginx must listen on `${PORT}` (never hardcode 80) and must SPA-fallback to `index.html`, or Cloud Run health checks and deep links break.
- `index.html` is served `no-cache` (hashed JS/CSS cached 1y), so a new deploy is visible without a hard refresh.
- `.dockerignore` keeps `node_modules` / `dist` / `.git` out of the build context - keep it.
