# Backup & Recovery Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually, and after any restore drill failure |
| Status | Active |

## 1. What is backed up

- The PostgreSQL database `platformDB` of each environment, which holds all platform and tenant data, is backed up nightly by Cloud SQL automated backups with point-in-time recovery (dev and staging today; production will be provisioned the same way).
- Source code, infrastructure definitions, runbooks, and this policy pack are version-controlled in git and mirrored on the hosted remote.
- Container images are retained in Artifact Registry; cloud service configuration is recoverable from the deploy runbooks under `.claude/skills/` and `docs/ops/`.

## 2. How and where

- The backup is Cloud SQL's automated backup of the instance (`platform-db-dev`, `platform-db-staging`), taken nightly in the 19:00 UTC (03:00 MYT) window, independent of the application (a compromised or down API cannot affect it).
- Point-in-time recovery keeps seven days of transaction logs, so the database can be cloned to any instant within that window.
- Backups and transaction logs are managed by Cloud SQL and are not reachable through any application or backup-job credential; the application's own database credential has no access to them.
- Backups are bound to the instance: production will additionally run a nightly `pg_dump` to a Cloud Storage bucket in a separate project (the design kept in `infra/db-backup/`: write-only service account, under-100 KB dump guard) so a copy survives the instance and reaches long retention.

## 3. Retention

- Seven automated nightly backups and seven days of point-in-time recovery logs are retained on each instance (Cloud SQL enforces this automatically).
- Production's additional dump-to-storage copies will be retained 30 days (daily) and 365 days (monthly, written on the 1st of each month) by bucket lifecycle rules; no manual deletion is performed or permitted.

## 4. Recovery objectives

- **RPO (max data loss): minutes** within the seven-day point-in-time window (a clone to the instant before the fault), or **24 hours** when restoring a nightly backup.
- **RTO (max restore time): one working day**, dominated by cloning or restoring the instance and repointing the services.

## 5. Restore testing

- The full procedure (scratch-restore drill and real disaster recovery) is the runbook [docs/ops/db-backup-restore.md](../ops/db-backup-restore.md).
- A restore drill into a scratch database is performed **at least quarterly**; each drill appends a dated PASS/FAIL row with verification counts to the drill log in the runbook.
- The first drill passed on 2026-07-29 with an exact row-count match, under the previous dump-based design; the first drill against the Cloud SQL instances is still to be run and logged.
- A failed drill is treated as a security incident (backup integrity) and handled per the [Incident Response Plan](incident-response-plan.md).

## 6. Failure alerting

- A Cloud Monitoring alert on failed Cloud SQL backup runs is still to be configured for each instance; until then the nightly backup list is checked as part of the restore drill and after any instance change.
- Ad-hoc backups are taken before risky manual database work as an on-demand Cloud SQL backup of the instance (see the runbook).
