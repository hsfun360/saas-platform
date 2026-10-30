# Alerting (Cloud Monitoring)

The alert set for the `platform-*` Cloud Run services, created 2026-10-30 in BOTH projects (`my-easy-software-dev`, `my-easy-software-staging`).
Everything here is reproducible from [`alerting/alerts-create.js`](alerting/alerts-create.js); the console is for reading, not for hand-editing policies.

## Notification channel

One email channel per project, **Platform operations email** -> `admin@myeasysoft.com`.
Google does not verify email channels, so the first alert is the test that the address receives mail.
To change the recipient, create a new channel and point the policies at it (`notificationChannels` on each policy); do not edit the address in place, the history of who was notified stays readable.

| Project | Channel |
| --- | --- |
| dev | `projects/my-easy-software-dev/notificationChannels/17974473027260274823` |
| staging | `projects/my-easy-software-staging/notificationChannels/4845016458770006542` |

## Policies

| Policy | Signal | Fires when | What to do |
| --- | --- | --- | --- |
| **Cloud Run 5xx error spike** | `run.googleapis.com/request_count`, response class 5xx, summed per service over 5 min | more than 5 server errors in 5 minutes on any one service | Read the service's logs at `severity>=ERROR` for the named revision; a brand-new revision answering 5xx right after a deploy is a bad deploy - roll traffic back. |
| **Login failure burst** | log-based metric `auth_login_failures` (platform-api lines `[AUTH] login failed`), summed over 5 min | more than 20 refused sign-ins in 5 minutes | Credential stuffing or brute force. The per-IP rate limit and the capped backoff are already slowing the caller; list the lines to see the IPs and reasons (`bad-credentials` / `bad-mfa-code`). Block at the edge once the load balancer exists. |
| **API boot or background job failure** | log match on platform-api / outbox worker | any `Database initialization failed`, `[POISON MESSAGE]`, `[OUTBOX WORKER] Database error`, `[OUTBOX WORKER] Failed to start`, `scan failed`, `run processing failed` or `Unhandled` line | The API may keep serving on an unsynced schema (the staging incident of 2026-10-27 looked exactly like this). Read the boot log of the revision; a boot failure after a model change usually means a pre-sync migration assumed a column. |
| **Scheduler sweep failure** | log match `resource.type="cloud_scheduler_job" AND severity>=ERROR` | the `outbox-sweep` job (every 5 min) reports an error | Emails and workflow SLA reminders queue until the sweep succeeds. Check the worker service is reachable and that the job's OIDC identity still holds `run.invoker` on it. |

Log-match policies notify at most once per hour per policy (`notificationRateLimit`) and auto-close after 30 minutes without a new match; the threshold policies auto-close the same way.

## The one application log line

Every refused sign-in logs exactly one line from `auth.controller.js`:

```text
[AUTH] login failed {"reason":"bad-credentials","ip":"203.0.113.9"}
```

`reason` is `bad-credentials` (unknown email or wrong password - deliberately the same, no enumeration) or `bad-mfa-code`.
The email is never logged.
The log-based metric counts these lines; renaming the prefix silently empties the metric, so the comment above the backoff helper in the controller points here.

## Testing an alert

- Login burst: 21 wrong-password attempts from one machine within 5 minutes (`POST /api/auth/login` with a bogus email) trip the rate limiter first, which still refuses with a logged line, so the metric climbs; expect the email within a few minutes.
- 5xx spike: do not fabricate; a failed deploy reproduces it naturally.
- Boot failure: the staging schema incident of 2026-10-27 would have fired it; the line it matches is `Database initialization failed`.

## Silencing

Use a Cloud Monitoring **snooze** on the policy for planned work (a long migration, a deliberate load test); never disable a policy, it is forgotten that way.

## Adding a policy

Add it to `alerting/alerts-create.js` (idempotent by display name) and run it for both projects:

```bash
node docs/ops/alerting/alerts-create.js my-easy-software-dev projects/my-easy-software-dev/notificationChannels/17974473027260274823 "$(gcloud auth print-access-token)"
```

Then describe it in the table above and in the [Logging, Monitoring & Audit Policy](../policies/logging-monitoring-and-audit-policy.md), in the same commit.
A new critical asynchronous path (a new worker scan, a new scheduler job) ships with its failure line listed in the boot-or-background-job filter.

## Still missing

- Cloud SQL backup-failure alert (the policy pack names it; Cloud SQL exposes backup status through `cloudsql.googleapis.com/database/backup/...` metrics - wire it when the production instance exists).
- Uptime checks on the public URLs, which belong with the load balancer and domain milestone.
