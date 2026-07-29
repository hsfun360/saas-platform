# Database Backup & Restore Runbook

This runbook covers the automated nightly backup of the platform Postgres database and the tested procedure for restoring it.
It exists to satisfy both real disaster recovery and the ISO 27001 backup control (documented, automated, restore-tested).

## What is in place

| Piece | Value |
| --- | --- |
| Database | `loginDB` on self-hosted PostgreSQL 18.x (Windows host `20.212.81.135:1029`) |
| Backup job | Cloud Run Job `db-backup` (project `membership-project-199610`, region `asia-southeast1`) |
| Image | `asia-southeast1-docker.pkg.dev/membership-project-199610/login-api/db-backup:latest` (source: [`infra/db-backup/`](../../infra/db-backup/)) |
| Method | `pg_dump -Fc` (custom format, compressed), uploaded to GCS via the job's service account |
| Schedule | Cloud Scheduler `db-backup-nightly`, 02:30 Asia/Kuala_Lumpur daily |
| Bucket | `gs://membership-project-199610-db-backups` (asia-southeast1, uniform access, public access prevented) |
| Retention | `daily/` deleted after 30 days; `monthly/` (written on the 1st of each month) deleted after 365 days; lifecycle rules in [`infra/db-backup/lifecycle.json`](../../infra/db-backup/lifecycle.json) |
| Credentials | `DATABASE_URL` injected from Secret Manager; the job's service account has **write-only** (`objectCreator`) bucket access, so a compromised job cannot delete or overwrite history |
| Alerting | Cloud Monitoring policy "DB backup failed" emails `hsfun360@gmail.com` on any ERROR-severity log from the job (a failed dump, a too-small dump, or a failed upload all exit non-zero and log to stderr) |

The dump floor check in `backup.sh` aborts if the dump is under 100 KB, so a "successful" empty dump cannot silently replace real backups.

## Operating the backup

Run an ad-hoc backup (for example right before risky manual DDL):

```powershell
gcloud run jobs execute db-backup --region asia-southeast1 --wait
```

Check recent executions and their outcome:

```powershell
gcloud run jobs executions list --job db-backup --region asia-southeast1 --limit 7
```

List what is in the bucket:

```powershell
gcloud storage ls -l gs://membership-project-199610-db-backups/daily/
gcloud storage ls -l gs://membership-project-199610-db-backups/monthly/
```

After changing `backup.sh` or the Dockerfile, rebuild and push, then the next execution picks it up:

```powershell
docker build --platform linux/amd64 -t asia-southeast1-docker.pkg.dev/membership-project-199610/login-api/db-backup:latest infra/db-backup
docker push asia-southeast1-docker.pkg.dev/membership-project-199610/login-api/db-backup:latest
```

## Restore procedure

The dump is `pg_dump` custom format, so `pg_restore` can restore the whole database or selected tables.

### A. Test restore into a scratch database (safe, use for drills)

1. Download the dump you want:

   ```powershell
   gcloud storage cp gs://membership-project-199610-db-backups/daily/<FILE>.dump .
   ```

2. Start a scratch Postgres 18 and restore into it:

   ```powershell
   docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=restoretest postgres:18-alpine
   docker cp .\<FILE>.dump pg-restore-test:/tmp/
   docker exec pg-restore-test createdb -U postgres loginDB
   docker exec pg-restore-test pg_restore -U postgres -d loginDB --no-owner /tmp/<FILE>.dump
   ```

3. Verify counts against expectations (see the verification query below), then clean up:

   ```powershell
   docker rm -f pg-restore-test
   ```

### B. Real disaster restore (database lost or corrupted)

1. Stop writes: scale `login-api` and `login-api-outboxworker` to zero or detach them, so nothing writes during the restore.
2. Provision a reachable Postgres 18 server (rebuild the existing host or stand up a replacement).
3. Create an empty `loginDB` and restore the newest dump with `pg_restore -d loginDB --no-owner <FILE>.dump` as a superuser.
4. Recreate the application login role if the server is brand new, matching the credentials in the `DATABASE_URL` secret (or add a new Secret Manager version with the new credentials).
5. Point the services at the server: if host or password changed, add a new `DATABASE_URL` secret version and redeploy/restart `login-api` and the worker.
6. Verify: run the verification query, then perform a real login in the web app and spot-check a membership screen.
7. Expected loss window (RPO): up to 24 hours, whatever changed since the last nightly dump.

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

## Restore test log

ISO 27001 wants evidence that restores are tested, not just that backups run.
Do a scratch restore (procedure A) at least quarterly and append a row here.

| Date | Dump tested | Result | Notes |
| --- | --- | --- | --- |
| 2026-07-29 | `daily/loginDB-20260729-141352.dump` | PASS | 68 tables, 16 users, 1 membership, 1 member, 29 audit rows - exact match with live DB; pg_restore clean, zero errors |

## Known limitations and next steps

- Logical dumps give a 24-hour RPO.
  If the business later needs point-in-time recovery, move to WAL archiving (or a managed Postgres); the bucket and job structure stay useful either way.
- The connection from the job to the DB is currently plaintext because the server has `ssl=off`.
  When TLS is enabled on the server (see the DB TLS task), no change is needed here - `pg_dump` will negotiate SSL automatically, and `sslmode=require` can be added to the secret's connection string.
- The alert email lives in a Cloud Monitoring notification channel; change it in Console under Monitoring -> Alerting -> Notification channels.
- The scheduler, job, bucket and alert are click-ops-free but not yet captured as IaC; if the infra footprint grows, lift them into Terraform.
