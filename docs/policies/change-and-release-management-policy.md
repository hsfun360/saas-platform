# Change & Release Management Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually |
| Status | Active |

## 1. Source control

- All code, infrastructure definitions, runbooks, and policies live in the `saas-platform` git monorepo.
- Work happens on the single long-lived `dev` branch (trunk-based); commits are small and prefixed by stream (`feat(membership):`, `fix(saas):`, `docs(...):`) so history separates work streams.
- `master` reflects only deployed, user-verified states; `dev` is merged to `master` at verified checkpoints.
- Generated files (for example `CHANGELOG.md`) are never edited by hand; the source that produces them is changed instead.

## 2. Review and verification

- Every change is developed against the working conventions in [docs/working-conventions.md](../working-conventions.md): bugs are reproduced end-to-end before fixing, and lint/test failures are fixed when found, whoever caused them.
- Changes to security-relevant surfaces (auth, RBAC, validation, secrets, backups) update the corresponding policy or `apps/api/docs/security-hardening.md` in the same commit, keeping documentation and reality in lock-step.
- New tables require structure approval before building; new endpoints must mount a rate limiter (if public) and request validation (always) - standing rules enforced in review.

## 3. Deployment

- Deployments are performed only through the documented runbooks (`.claude/skills/deploy-api`, `deploy-web`, `deploy-worker`), which build immutable images, push to Artifact Registry, and roll a new Cloud Run revision.
- Deploys are made from a committed tree at commit boundaries, so every running revision is traceable to a commit.
- Order matters and is documented per release when it does (for example: worker before api when email templates change).
- Cloud Run keeps prior revisions; rollback is re-routing traffic to the previous revision.

## 4. Database changes

- Schema changes ship as Sequelize model changes; the application applies them at boot (`sync({ alter: true })`) under an advisory lock, gated by a model fingerprint so unchanged deploys skip DDL.
- Manual renames/drops are executed before the deploy that expects them, and an ad-hoc backup is taken first (see [Backup & Recovery Policy](backup-and-recovery-policy.md)).
- Destructive seeds (`RUN_SEED`) are prohibited against production data.

## 5. Segregation of duties

- The team is small, so segregation is achieved through system design rather than headcount: production secrets are readable only by the deployed services (Secret Manager IAM), backup history is write-only from the job path, deploys leave immutable revision history, and every data-touching action is audit-logged with the acting user.
- As the team grows, deploy rights and cloud IAM roles are the first place to split duties.

## 6. Emergency changes

- Emergency fixes follow the same pipeline (commit, build, deploy runbook) - the pipeline is fast enough that no out-of-band path is needed or permitted.
- If an emergency change must precede its documentation, the policy/doc update follows within one working day.
