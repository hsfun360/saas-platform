# CI/CD Pipeline (GitHub Actions)

Live since 2026-08-01.
Two workflows in [`.github/workflows/`](../../.github/workflows/), keyless GCP auth, build-once-promote by image digest.

## The model

- **Build once.** Every push to `dev` touching `apps/**` builds `platform-api` and `platform-web` into the ONE registry (`asia-southeast3-docker.pkg.dev/my-easy-software-dev/login-apps`), tagged with the git SHA and `latest`.
- **Deploy by digest.** The dev services are deployed with `image@sha256:...`, never a tag.
- **Promote, never rebuild.** Staging pulls from the same registry (its Cloud Run service agent has reader access), so promotion redeploys the EXACT digests dev is serving. What was verified on dev is byte-for-byte what staging runs. The future prod target follows the same pattern.
- Cloud Run env vars / secrets / flags persist across image-only deploys, so the workflows only ever change the image. Environment config stays owned by the environment (set once via the runbooks), not by the pipeline.

## Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `deploy-dev.yml` | push to `dev` touching `apps/**` (or the workflow itself) | build + push both images, deploy worker -> api -> web to dev BY DIGEST, smoke-check the api root and `/api/auth/sso-config` through the web proxy |
| `promote-staging.yml` | manual (`workflow_dispatch` - this IS the approval gate) | read the digests dev currently serves, deploy them worker -> api -> web to staging, smoke-check staging |

Run the promotion from the GitHub UI (Actions -> "Promote to staging" -> Run workflow) or:

```bash
gh workflow run promote-staging.yml --repo hsfun360/saas-platform
```

Note: `workflow_dispatch` workflows must exist on the DEFAULT branch (`master`) to be triggerable, so pipeline changes reach `master` at the usual verified-checkpoint pushes.

The worker deploys BEFORE the api in both workflows (standing convention: outbox/template changes must be live in the sender before producers write them).

## Auth (Workload Identity Federation - no keys anywhere)

GitHub's OIDC tokens are exchanged directly for GCP credentials; no service-account JSON exists.

- Pool `github` + provider `github-oidc` in `my-easy-software-dev` (project number `855636431759`), locked to `assertion.repository == 'hsfun360/saas-platform'`.
- Deployer SA `github-deployer@my-easy-software-dev.iam.gserviceaccount.com`, impersonable only by that repo's workflows (`roles/iam.workloadIdentityUser` on the principalSet).
- Grants: `run.admin` + `iam.serviceAccountUser` on BOTH `my-easy-software-dev` and `my-easy-software-staging`; `artifactregistry.writer` on the `login-apps` repo.
- Adding the future prod target = grant the same two project roles on the prod project and copy `promote-staging.yml` to a `promote-prod.yml` (ideally behind a GitHub Environment with required reviewers).

## First run verified 2026-08-01

- `Deploy to dev` run 30700224490: build + 3 digest deploys + smoke checks, all green.
- `Promote to staging` run 30700463769: green; confirmed dev and staging serve IDENTICAL digests afterwards.

## Manual deploys

The `deploy-api` / `deploy-web` / `deploy-worker` skills remain the documented fallback (and the only path for env/secret changes, which the pipeline deliberately does not manage).
A manual `:latest` deploy is self-healing: the promotion workflow resolves tags to digests before deploying staging.
