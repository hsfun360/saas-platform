# Backup & Recovery Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually, and after any restore drill failure |
| Status | Active |

## 1. What is backed up

- The production PostgreSQL database `loginDB`, which holds all platform and tenant data, is backed up nightly as a compressed `pg_dump` custom-format archive.
- Source code, infrastructure definitions, runbooks, and this policy pack are version-controlled in git and mirrored on the hosted remote.
- Container images are retained in Artifact Registry; cloud service configuration is recoverable from the deploy runbooks under `.claude/skills/` and `docs/ops/`.

## 2. How and where

- The backup runs as the `db-backup` Cloud Run Job, triggered by Cloud Scheduler at 02:30 Asia/Kuala_Lumpur nightly, independent of the application (a compromised or down API cannot affect it).
- Dumps are written to the Cloud Storage bucket `membership-project-199610-db-backups`, which lives with a different provider than the database host, giving genuine off-site separation.
- The job's service account holds write-only (`objectCreator`) access: backup history cannot be read, overwritten, or deleted through the backup path, protecting against ransomware-style destruction.
- An empty-dump guard refuses to upload archives under 100 KB, so a silently broken dump cannot masquerade as a good backup.

## 3. Retention

- Daily backups (`daily/`) are retained 30 days.
- Monthly backups (`monthly/`, written on the 1st of each month) are retained 365 days.
- Retention is enforced automatically by bucket lifecycle rules; no manual deletion is performed or permitted.

## 4. Recovery objectives

- **RPO (max data loss): 24 hours** - the gap between nightly dumps.
- **RTO (max restore time): one working day**, dominated by re-provisioning a database host if the original is lost.
- If the business later requires a tighter RPO, the documented step-up is WAL archiving / point-in-time recovery; the bucket and job structure carry over.

## 5. Restore testing

- The full procedure (scratch-restore drill and real disaster recovery) is the runbook [docs/ops/db-backup-restore.md](../ops/db-backup-restore.md).
- A restore drill into a scratch database is performed **at least quarterly**; each drill appends a dated PASS/FAIL row with verification counts to the drill log in the runbook.
- The first drill passed on 2026-07-29 with an exact row-count match against production.
- A failed drill is treated as a security incident (backup integrity) and handled per the [Incident Response Plan](incident-response-plan.md).

## 6. Failure alerting

- Any error in the backup job (dump failure, undersized dump, upload failure) marks the execution failed and triggers a Cloud Monitoring email alert to the operations address.
- Ad-hoc backups are taken before risky manual database work: `gcloud run jobs execute db-backup --region asia-southeast1 --wait`.
