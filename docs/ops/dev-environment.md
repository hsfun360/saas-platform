# Dev Environment (my-easy-software-dev)

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
| Artifact Registry | `asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps` (`login-api`, `login-web`) |
| Web | Cloud Run `login-web` - https://login-web-855636431759.asia-southeast3.run.app |
| API | Cloud Run `login-api` - https://login-api-855636431759.asia-southeast3.run.app |
| Database | Cloud SQL `login-db-dev`, PostgreSQL 18, `db-g1-small`, zonal, database `platformDB` (renamed from `loginDB` 2026-07-31 via `ALTER DATABASE`), user `postgres` |
| DB connectivity | Cloud Run connector (`--add-cloudsql-instances`), unix socket; `DATABASE_URL` uses `?host=/cloudsql/my-easy-software-dev:asia-southeast3:login-db-dev` (Sequelize v6 honours the `host` query param for socket paths) |
| Secrets (Secret Manager) | `DATABASE_URL`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `SMTP_ENCRYPTION_KEY` - all dev-only values, generated fresh (prod keys are never shared with dev) |
| Worker | NOT deployed (no email sending in dev yet; outbox rows just accumulate) |
| Google/Microsoft SSO | NOT configured (needs an OAuth client under the myeasysoft.com identity; email/password login works) |

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
docker build --platform linux/amd64 -t asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/login-api:latest apps/api
docker build --platform linux/amd64 -t asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/login-web:latest apps/web
gcloud config set account admin@myeasysoft.com
docker push asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/login-api:latest
docker push asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/login-web:latest
gcloud config set account hsfun360@gmail.com
```

Deploy (env vars and secrets persist across image-only deploys, same as prod):

```powershell
gcloud run deploy login-api --image asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/login-api:latest --region asia-southeast3 --project my-easy-software-dev --account admin@myeasysoft.com --allow-unauthenticated
gcloud run deploy login-web --image asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps/login-web:latest --region asia-southeast3 --project my-easy-software-dev --account admin@myeasysoft.com --allow-unauthenticated
```

Current env wiring (already attached, listed for reference):

- `login-api`: `ADMIN_EMAILS=admin@myeasysoft.com`, `FRONTEND_BASE_URL=https://login-web-855636431759.asia-southeast3.run.app`, secrets `DATABASE_URL` / `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` / `SMTP_ENCRYPTION_KEY`, Cloud SQL connector to `login-db-dev`.
- `login-web`: `API_HOST=login-api-855636431759.asia-southeast3.run.app`.
- `RUN_SEED` must NEVER stay set on the service: it wipes and reseeds on every cold start.
  It was used once on the first deploy and then removed.

## One-off DB scripts (seed-users job)

`scripts/` is excluded from the image by `.dockerignore`, so DB scripts cannot run as a container command directly.
The pattern used instead: Cloud Run Job `seed-users` runs the api image with `--command node --args="-e,eval(process.env.SEED_CODE)"` and the script body in a `SEED_CODE` env var (set via `--env-vars-file`).
The job has the Cloud SQL connector and the `DATABASE_URL` secret attached.
It currently holds an idempotent snippet that (re)creates the verified dev admin `admin@myeasysoft.com` with System Admin membership and prints a fresh random password ONCE to the job logs.
Re-run it to rotate/recover the dev admin password:

```powershell
gcloud run jobs execute seed-users --region asia-southeast3 --project my-easy-software-dev --account admin@myeasysoft.com --wait
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=seed-users AND textPayload:DEV_ADMIN_READY" --project=my-easy-software-dev --account=admin@myeasysoft.com --limit=1 --format="value(textPayload)"
```

## Backups

Cloud SQL automated backups are NOT yet enabled on `login-db-dev` (dev data is disposable seed data).
Enable them (or extend the pg_dump job pattern) before any data worth keeping lands in dev, and definitely for staging/prod instances.

## Still to do for the environment split

- Provision `my-easy-software-staging` (same recipe, UAT values).
- CI/CD: GitHub Actions with Workload Identity Federation - build once, deploy the same image digest dev -> staging -> prod with approval gates.
- Prod project + Cloud SQL in `asia-southeast1`, LB + Cloud Armor + myeasysoft.com, then migrate off the old project and the external Windows Postgres host.
- Deploy the outbox worker to dev when email testing is needed (needs SMTP creds), and a dev OAuth client if SSO must be tested.
