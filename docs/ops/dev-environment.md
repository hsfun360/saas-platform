# Dev & Staging Environments (my-easy-software-dev / my-easy-software-staging)

The development environment is fully separated from the old `membership-project-199610` project.
It lives in its own GCP project under the myeasysoft.com organization, in region `asia-southeast3` (Bangkok).
Set up on 2026-07-31.
A staging project (`my-easy-software-staging`) exists but is not provisioned yet; a prod project will be created later.

## What is in place

| Piece | Value |
| --- | --- |
| Project | `my-easy-software-dev` (number `855636431759`), billing linked |
| Admin account | `admin@myeasysoft.com` (gcloud credentialed on the dev machine; the DEFAULT gcloud account remains `hsfun360@gmail.com` for the old prod project) |
| Region | `asia-southeast3` (Bangkok). Note: NOT Malaysia - the KL region is `asia-southeast4` and has no Cloud Run yet |
| Artifact Registry | `asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps` (`platform-api`, `platform-web`; renamed from `login-api`/`login-web` 2026-07-31) |
| Web | Cloud Run `platform-web` - https://platform-web-855636431759.asia-southeast3.run.app |
| API | Cloud Run `platform-api` - https://platform-api-855636431759.asia-southeast3.run.app |
| Database | Cloud SQL `platform-db-dev`, PostgreSQL 18, `db-g1-small`, zonal, database `platformDB`, user `postgres` (instance cloned from `login-db-dev` + old instance deleted, and database renamed from `loginDB`, both 2026-07-31) |
| DB connectivity | Cloud Run connector (`--add-cloudsql-instances`), unix socket; `DATABASE_URL` uses `?host=/cloudsql/my-easy-software-dev:asia-southeast3:platform-db-dev` (Sequelize v6 honours the `host` query param for socket paths) |
| Secrets (Secret Manager) | `DATABASE_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `SMTP_ENCRYPTION_KEY` - all dev-only values, generated fresh (prod keys are never shared with dev) |
| Worker | Cloud Run `platform-api-outboxworker` in **drain mode** (2026-08-01, scale-to-zero): platform-api image with `--command node --args outboxworker.js`, `WORKER_MODE=drain`, `--min-instances 0` + CPU throttling (bills only while draining), `--no-allow-unauthenticated`, Cloud SQL connector, env `EMAIL_USER=hsfun360@gmail.com` + secrets `DATABASE_URL`/`EMAIL_PASS`/`SMTP_ENCRYPTION_KEY`. Wake-up: api pings `POST /drain` after each enqueue commit (`OUTBOX_WORKER_URL` env on `platform-api`, OIDC via metadata server, compute SA has `run.invoker` on the worker) + Cloud Scheduler `outbox-sweep` every 5 min (`/drain?sweep=1`, ALSO runs the workflow SLA scan; job lives in `asia-southeast1` - Scheduler is not offered in asia-southeast3). Verified 2026-08-01: ping-driven `password.reset` delivered in 3s end-to-end; sweep returns 200. NOTE: `SMTP_ENCRYPTION_KEY` is ALIGNED to the old environment's value because the copied `CompanySmtpConfigs` rows are encrypted with it - a fresh key cannot decrypt them |
| Google SSO | CONFIGURED (2026-07-31): the login screen reads `GET /api/auth/sso-config` - `GOOGLE_CLIENT_ID` env (fallback = legacy prod client) + `MICROSOFT_SSO_ENABLED` toggle. Dev OAuth client `855636431759-7dktsf4ls0iq5h6e5gsu9abeeo8gd5q6` (created in the dev project's Console; authorized origin = the platform-web URL, redirect URI = that URL + `/login`); `GOOGLE_CLIENT_ID` env + `GOOGLE_CLIENT_SECRET` secret attached to `platform-api`. Handshake verified to Google's sign-in page; full sign-in requires a real Google account. When the web URL changes, update the client's origin + redirect URI in Console |
| Microsoft SSO | Button HIDDEN in dev (`MICROSOFT_SSO_ENABLED=false` on `platform-api`); deferred until Microsoft is a verified prod path |

## Same-origin /api without a load balancer

Dev has no HTTPS LB.
Instead, the web container's nginx now reverse-proxies `/api/*` to the API service (see `apps/web/nginx.conf`), controlled by the `API_HOST` env var (default in `apps/web/Dockerfile` = the old prod API host; the dev service overrides it).
This keeps the app same-origin with the API, so cookies (refresh token, trusted device) and CORS behave exactly like prod behind the LB.
In prod the LB answers `/api/*` before traffic reaches nginx, so the location is dormant there.

## Org policy exception (public access)

The myeasysoft.com organization enforces Domain Restricted Sharing (`iam.allowedPolicyMemberDomains`), which blocks `allUsers` bindings.
A PROJECT-LEVEL exception (`allowAll: true`) was created on `my-easy-software-dev` only, so the two Cloud Run services can be public.
The org default still applies to every other project.
When staging/prod projects are provisioned they will need the same decision (prod will likely sit behind the LB + Cloud Armor instead).
`admin@myeasysoft.com` was granted `roles/orgpolicy.policyAdmin` at the org level to manage this.

## Deploying to dev

Build and push (docker credential helper follows the ACTIVE gcloud account; switch or use a token when pushing to the dev registry):

```powershell
docker build --platform linux/amd64 -t asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-api:latest apps/api
docker build --platform linux/amd64 -t asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-web:latest apps/web
gcloud config set account admin@myeasysoft.com
docker push asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-api:latest
docker push asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-web:latest
gcloud config set account hsfun360@gmail.com
```

Deploy (env vars and secrets persist across image-only deploys, same as prod):

```powershell
gcloud run deploy platform-api --image asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-api:latest --region asia-southeast3 --project my-easy-software-dev --account admin@myeasysoft.com --allow-unauthenticated
gcloud run deploy platform-web --image asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/platform-web:latest --region asia-southeast3 --project my-easy-software-dev --account admin@myeasysoft.com --allow-unauthenticated
```

Current env wiring (already attached, listed for reference):

- `platform-api`: `ADMIN_EMAILS=admin@myeasysoft.com`, `FRONTEND_BASE_URL=https://platform-web-855636431759.asia-southeast3.run.app`, secrets `DATABASE_URL` / `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `SMTP_ENCRYPTION_KEY`, Cloud SQL connector to `platform-db-dev`.
- `platform-web`: `API_HOST=platform-api-855636431759.asia-southeast3.run.app`.
- `RUN_SEED` must NEVER stay set on the service: it wipes and reseeds on every cold start.
  It was used once on the first deploy and then removed.

## Data provenance (full copy from the old environment, 2026-07-31)

`platformDB` is a FULL COPY of the old environment's `loginDB` (the external Windows Postgres), taken 2026-07-31.
That brought over the real platform catalogue (5 modules, 41 menus), all subscribers/companies/users (old dev/test data - the old environment was also dev), and every product schema (`membership`, `golf`, `tax`, `workflow`, `audit`).
The earlier demo-seeder content was discarded in the process.

How it was done (repeatable for staging, and the rehearsal for the future prod migration):

1. A `postgres:18-alpine` client-tools image lives at `.../login-apps/pg-tools:18` (Cloud Run cannot pull Docker Hub directly).
2. A one-off Cloud Run Job ran `pg_dump -Fc` against the old server (publicly reachable) into `/tmp`, then DROPPED and RE-CREATED `platformDB` (restore into a PRISTINE database - do NOT use `pg_restore --clean` into a live one, dependency-order drops fail), then `pg_restore --no-owner --no-acl`.
3. Source/target URLs were passed as Secret Manager refs (`SRC_DATABASE_URL` staged temporarily, deleted after; target = the standard `DATABASE_URL`).
4. The job and the source-URL secret were deleted afterwards; the `pg-tools:18` image was kept.
5. `seed-users` was re-run afterwards to recreate the dev admin (the restore replaces ALL rows, including it), and `platform-api` was redeployed to reset connection pools.

Gotcha: most tables are SINGULAR (`public."User"`, `public."Account"`); only a few are plural (`Modules`, `Menus`, `Roles`, `RoleMenus`). Check names before writing verification queries.

## One-off DB scripts (seed-users job)

`scripts/` is excluded from the image by `.dockerignore`, so DB scripts cannot run as a container command directly.
The pattern used instead: Cloud Run Job `seed-users` runs the api image (`platform-api:latest`) with `--command node --args="-e,eval(process.env.SEED_CODE)"` and the script body in a `SEED_CODE` env var (set via `--env-vars-file`).
The job has the Cloud SQL connector (`platform-db-dev`) and the `DATABASE_URL` secret attached.
It currently holds an idempotent snippet that (re)creates the verified dev admin `admin@myeasysoft.com` with System Admin membership and prints a fresh random password ONCE to the job logs.
Re-run it to rotate/recover the dev admin password:

```powershell
gcloud run jobs execute seed-users --region asia-southeast3 --project my-easy-software-dev --account admin@myeasysoft.com --wait
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=seed-users AND textPayload:DEV_ADMIN_READY" --project=my-easy-software-dev --account=admin@myeasysoft.com --limit=1 --format="value(textPayload)"
```

## Backups

Cloud SQL automated backups are NOT yet enabled on `platform-db-dev` (dev data is disposable seed data).
Enable them (or extend the pg_dump job pattern) before any data worth keeping lands in dev, and definitely for staging/prod instances.

## Old environment decommissioned (2026-08-01)

The old environment in `membership-project-199610` (asia-southeast1) was decommissioned after dev became fully self-sufficient.
A FINAL `pg_dump` was taken first (`gs://membership-project-199610-db-backups/daily/loginDB-20260801-192525.dump`).

Deleted: Cloud Run services `login-web` / `login-api` / `login-api-outboxworker`, the `db-backup` job + `db-backup-nightly` scheduler, and the whole edge (forwarding rules, HTTP/HTTPS proxies, URL maps, backend services, NEGs, managed cert, Cloud Armor policy `waf-myeasysoft`, static IP `136.68.18.10` released).
`myeasysoft.com` is therefore DARK until the future prod environment gets its own LB (it will get a NEW IP - the GoDaddy A record must be updated at that cutover).

Kept in the old project (cheap, irreplaceable or harmless): the GCS backup bucket `membership-project-199610-db-backups` (365-day monthly retention), Secret Manager secrets, the Artifact Registry images, the monitoring alert policy (now inert), and the old Google OAuth client.
The project itself stays alive as the container for these.

Outside GCP, still the user's to do: shut down the external Windows Postgres server (`20.212.81.135` - nothing references it anymore), and optionally remove the dead GoDaddy A record until prod cutover.

## Staging environment (my-easy-software-staging, provisioned 2026-08-01)

Same recipe as dev, in project `my-easy-software-staging` (number `640963543517`), region `asia-southeast3`.
Differences from dev are deliberate and few:

| Piece | Value |
| --- | --- |
| Web | Cloud Run `platform-web` - https://platform-web-640963543517.asia-southeast3.run.app |
| API | Cloud Run `platform-api` - https://platform-api-640963543517.asia-southeast3.run.app |
| Worker | `platform-api-outboxworker`, drain mode, scale-to-zero, `outbox-sweep` scheduler (asia-southeast1) - identical wiring to dev |
| Images | **Pulled from the DEV project's registry** (`asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/...`); staging's Cloud Run service agent has `artifactregistry.reader` on that repo. This is the build-once-promote seam for the future CI/CD pipeline - staging has NO registry of its own |
| Database | Cloud SQL `platform-db-staging` (PG18, db-g1-small, zonal), database `platformDB`, seeded 2026-08-01 as a COPY OF DEV (db-copy job pattern with BOTH Cloud SQL connectors attached; the temporary cross-project `cloudsql.client` grant and `SRC_DATABASE_URL` secret were removed after) |
| Secrets | Own `DATABASE_URL` + FRESH JWT keypair; `SMTP_ENCRYPTION_KEY` and `EMAIL_PASS` copied from dev (the SMTP key MUST match wherever the data came from) |
| Admin | `admin@myeasysoft.com` via the staging `seed-users` job (its own password, printed once to job logs - same rotate/recover procedure as dev) |
| SSO | Google NOT configured yet (needs a staging OAuth client + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, same steps as dev); Microsoft hidden (`MICROSOFT_SSO_ENABLED=false`) |
| Org policy | Same project-level `allUsers` exception as dev |

Verified 2026-08-01: browser login as staging admin, full catalogue present (5 modules / 41 menus / 24 users), forgot-password email delivered in 4s via ping-driven drain, sweep firing.

## Still to do for the environment split

- CI/CD: DONE 2026-08-01 - see [`cicd.md`](cicd.md) (push to `dev` -> build + deploy dev; manual "Promote to staging" redeploys the same digests).
- Cloud SQL automated backups for staging (and dev if its data stops being disposable).
- Prod project + Cloud SQL, LB + Cloud Armor + myeasysoft.com cutover (region decision at that point: asia-southeast1, or asia-southeast4 if Cloud Run is available there by then).
- Staging Google OAuth client when SSO testing on staging is needed.
