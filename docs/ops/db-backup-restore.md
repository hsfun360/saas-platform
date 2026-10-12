# Database Backup & Restore Runbook

This runbook covers the automated backups of the platform Postgres databases and the procedure for restoring them.
It exists to satisfy both real disaster recovery and the ISO 27001 backup control (documented, automated, restore-tested).

The mechanism changed on 2026-08-01 when the self-hosted database and the old `membership-project-199610` environment were decommissioned.
The live environments run on Cloud SQL, and Cloud SQL's own automated backups plus point-in-time recovery (PITR) are the backup.
The old `pg_dump`-to-GCS job is described at the end under "Historical" because its pattern is the planned long-retention add-on for production.

## What is in place (dev and staging, since 2026-08-02)

| Piece | Value |
| --- | --- |
| Databases | `platformDB` on Cloud SQL `platform-db-dev` (project `my-easy-software-dev`) and `platform-db-staging` (project `my-easy-software-staging`), both PostgreSQL 18, `db-g1-small`, zonal, region `asia-southeast3` |
| Method | Cloud SQL automated backups + point-in-time recovery (transaction-log retention) on BOTH instances |
| Schedule | Nightly backup window 19:00 UTC (03:00 MYT) |
| Retention | 7 retained automated backups and 7 days of transaction logs (PITR), plus the initial on-demand backup taken on each instance |
| Scope | Instance-bound: the backups and the PITR logs live with the instance and are deleted with it (see "What is instance-bound" below) |
| Access | `admin@myeasysoft.com` (the default gcloud account `hsfun360@gmail.com` has no access to these projects) |
| Alerting | None recorded for the Cloud SQL backups yet; the old "DB backup failed" Cloud Monitoring policy in the old project is inert (see Historical) |

The application reaches each instance through the Cloud Run connector over a unix socket (`DATABASE_URL` carries `?host=/cloudsql/<project>:asia-southeast3:<instance>`), so nothing in the backup path depends on the application being healthy.

The commands below use the dev project; for staging replace `my-easy-software-dev` with `my-easy-software-staging` and `platform-db-dev` with `platform-db-staging`.

## Checking the backups

List the automated backups an instance holds (the newest should be from last night's window):

```powershell
gcloud sql backups list --instance=platform-db-dev --project my-easy-software-dev --account admin@myeasysoft.com
```

Confirm the backup configuration (automated backups enabled, the 19:00 UTC window, PITR on) from the instance description:

```powershell
gcloud sql instances describe platform-db-dev --project my-easy-software-dev --account admin@myeasysoft.com --format="yaml(settings.backupConfiguration)"
```

The `describe` form above is the standard gcloud command for this check; it is not yet part of a rehearsed drill in this environment.

Take an on-demand backup before risky manual DDL (the initial backups on both instances were taken this way; the gcloud form is the standard `gcloud sql backups create --instance=<inst>` and is not yet rehearsed here).

## Restore procedure

Two restore shapes exist, and they differ in blast radius:

- **Restore a backup onto an instance** (`gcloud sql backups restore`) overwrites that instance's data with the backup.
  Use it when the database content is lost or corrupted and the latest nightly backup is acceptable.
- **Clone to a point in time** (PITR) creates a NEW instance at a chosen instant within the 7-day log window.
  Use it to recover from a bad write (a wrong migration, a destructive script) with minutes of loss instead of a day, and to drill without touching the live instance.

### A. Point-in-time clone (preferred for drills and for bad-write recovery)

1. Pick the instant to recover to (UTC), before the bad write landed.
2. Clone the instance to that instant:

   ```powershell
   gcloud sql instances clone platform-db-dev platform-db-dev-restore --point-in-time "2026-10-12T18:30:00Z" --project my-easy-software-dev --account admin@myeasysoft.com
   ```

   `clone` with `--point-in-time` is the standard gcloud form of the "clone-to-a-point-in-time" step recorded in [`dev-environment.md`](dev-environment.md); it has not yet been rehearsed in this environment, so confirm the flag against `gcloud sql instances clone --help` the first time.
3. Run the verification query against the clone and compare the counts with the last known-good numbers.
4. For a drill, delete the clone afterwards (it bills as a full instance while it exists) and append a row to the restore test log.
5. For a real recovery, either repoint the services at the clone (a new `DATABASE_URL` secret version with the clone's connector path, `--add-cloudsql-instances` for the new instance, redeploy `platform-api` and `platform-api-outboxworker`) or restore the clone's content onto the original instance and keep the original connector wiring.

### B. Restore a backup onto the live instance (database lost or corrupted)

1. Stop writes: quiesce `platform-api` and `platform-api-outboxworker` (scale to zero or pause the `outbox-sweep` scheduler), so nothing writes during the restore.
2. Find the backup id:

   ```powershell
   gcloud sql backups list --instance=platform-db-dev --project my-easy-software-dev --account admin@myeasysoft.com
   ```

3. Restore it onto the instance:

   ```powershell
   gcloud sql backups restore <BACKUP_ID> --restore-instance=platform-db-dev --project my-easy-software-dev --account admin@myeasysoft.com
   ```

4. Redeploy `platform-api` (an image-only deploy is enough) so every instance's connection pool is rebuilt against the restored database, the same step the 2026-07-31 data copy needed.
5. Verify: run the verification query, then perform a real login in the web app and spot-check a membership screen.
6. Expected loss window (RPO): up to 24 hours for a backup restore (whatever changed since the nightly window), or minutes for a point-in-time clone within the 7-day log window.

Verification query (run against the restored DB and compare with the last known-good numbers):

```sql
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog','information_schema')) AS tables,
  (SELECT count(*) FROM public."User")            AS users,
  (SELECT count(*) FROM membership."Membership")  AS memberships,
  (SELECT count(*) FROM membership."Member")      AS members,
  (SELECT count(*) FROM audit."AuditLog")         AS audit_rows;
```

Most tables are singular (`public."User"`, `public."Account"`); only a few are plural (`Modules`, `Menus`, `Roles`, `RoleMenus`).

## What is instance-bound

Cloud SQL automated backups and the PITR transaction logs belong to the instance.
Deleting the instance deletes every backup and the log window with it, so an accidental `gcloud sql instances delete` is also a total loss of backup history.
Two consequences:

- Never delete an instance to "start over" without first exporting a dump you keep elsewhere.
- For production, the instance-bound backups are not enough on their own: add the `pg_dump`-to-GCS job pattern (`infra/db-backup/`, see Historical) on top, writing to a bucket in a different project, for long retention and for a copy that survives the instance.

## Production plan (not provisioned yet)

Per [`dev-environment.md`](dev-environment.md), the prod instance gets the same Cloud SQL automated backups + PITR, and ADDITIONALLY the nightly `pg_dump -Fc` Cloud Run Job uploading to a GCS bucket with the 30-day daily / 365-day monthly lifecycle rules kept in [`infra/db-backup/lifecycle.json`](../../infra/db-backup/lifecycle.json).
The job image (`infra/db-backup/Dockerfile`, Postgres 18 client tools plus curl and jq) and `backup.sh` (dump, 100 KB floor check, upload with the job's own service-account token) are kept in the repo for that purpose.
When it is set up, give the job's service account write-only (`objectCreator`) access to the bucket and recreate the "DB backup failed" Cloud Monitoring alert on the job's ERROR logs, as the old environment had.

## Restore test log

ISO 27001 wants evidence that restores are tested, not just that backups run.
Do a point-in-time clone drill (procedure A) at least quarterly and append a row here.
No drill against the Cloud SQL instances has been recorded yet; the 2026-07-29 drill in the Historical section was against the decommissioned environment.

| Date | Instance / backup tested | Result | Notes |
| --- | --- | --- | --- |
| | | | |

## Known limitations and next steps

- No failure alert is wired for the Cloud SQL backups; add a Cloud Monitoring policy on failed backup runs for each instance.
- The first PITR clone drill has not been run; run it, record the exact commands that worked, and drop the "not yet rehearsed" notes above.
- Backups are instance-bound (see above); production needs the additional dump-to-GCS job before launch.
- The instances are zonal (`db-g1-small`); a zone outage means downtime until a restore, which is accepted for dev and staging and must be revisited for production.

## Historical (decommissioned 2026-08-01)

Kept to explain past decisions and the production plan; none of these resources serve the live environments.

Until 2026-08-01 the database was `loginDB` on a self-hosted PostgreSQL 18 Windows host (`20.212.81.135:1029`), backed up by the Cloud Run Job `db-backup` (project `membership-project-199610`, region `asia-southeast1`, image `.../login-api/db-backup:latest` built from `infra/db-backup/`).
Cloud Scheduler `db-backup-nightly` ran it at 02:30 Asia/Kuala_Lumpur; `backup.sh` ran `pg_dump -Fc`, refused dumps under 100 KB, and uploaded to `gs://membership-project-199610-db-backups` (`daily/` kept 30 days, `monthly/` written on the 1st and kept 365 days, per `lifecycle.json`).
The job's service account had write-only (`objectCreator`) bucket access, so a compromised job could not delete or overwrite history, and a Cloud Monitoring policy "DB backup failed" emailed on any ERROR-severity log from the job.
This design (logical dumps, 24-hour RPO, write-only bucket, size floor, alert) is what production will add on top of Cloud SQL.

Restore drill under that design: 2026-07-29, `daily/loginDB-20260729-141352.dump`, PASS - 68 tables, 16 users, 1 membership, 1 member, 29 audit rows, exact match with the live DB, `pg_restore` clean with zero errors.
The scratch-restore recipe was a `postgres:18-alpine` container, `createdb loginDB`, then `pg_restore --no-owner` of the dump.

On 2026-08-01 a FINAL dump was taken (`gs://membership-project-199610-db-backups/daily/loginDB-20260801-192525.dump`), then the `login-web` / `login-api` / `login-api-outboxworker` services, the `db-backup` job and the `db-backup-nightly` scheduler were deleted.
The bucket (365-day monthly retention), the Secret Manager secrets, the Artifact Registry images and the now-inert alert policy stay in the old project.
The dev database `platformDB` was seeded on 2026-07-31 as a full copy of `loginDB` by a one-off Cloud Run Job (`pg_dump -Fc` into `/tmp`, drop and recreate the target, `pg_restore --no-owner --no-acl`); that same job pattern is the rehearsal for the future prod migration (see [`dev-environment.md`](dev-environment.md), "Data provenance").
