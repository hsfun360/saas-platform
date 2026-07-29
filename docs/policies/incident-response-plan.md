# Incident Response Plan

| | |
| --- | --- |
| Owner | [OWNER - incident commander by default] |
| Effective | 2026-07-29 |
| Review | Annually, and after every Sev-1/Sev-2 incident |
| Status | Active |

## 1. What counts as an incident

Any event that harms or credibly threatens the confidentiality, integrity, or availability of the platform or tenant data.
Examples: credential compromise, data exposure across tenant boundaries, ransomware or data destruction, sustained denial of service, a failed backup-restore drill, discovery of an exploited vulnerability, loss of a secret.

## 2. Severity

| Sev | Definition | Examples |
| --- | --- | --- |
| 1 | Confirmed tenant-data breach, active attacker, or full outage | Cross-tenant data read, leaked `DATABASE_URL`, database destroyed |
| 2 | Material risk contained to one tenant/account, or degraded service | One account compromised via phished password (no MFA), backup failures for >48 h |
| 3 | No data impact, contained early | Blocked brute-force wave, vulnerability found before exploitation |

## 3. Detection sources

- Cloud Monitoring alerts (backup failure today; the alert set grows with the platform).
- Cloud Logging for `login-api`, `login-web`, the worker, and the `db-backup` job.
- The append-only audit trail (`audit."AuditLog"`) with per-tenant and platform viewers.
- Dependabot and Artifact Registry vulnerability findings.
- Reports from subscribers or team members (treat every report as real until triaged).

## 4. Response steps

1. **Declare and command.** Note the time, assign an incident commander (default: platform owner), open a running incident note (timestamps, actions, evidence).
2. **Contain.**
   - Compromised user account: revoke its refresh tokens (password reset revokes the family), reset MFA if enrolled by the attacker, suspend the account.
   - Compromised secret: add a new Secret Manager version, redeploy api/worker, disable the old version; rotate downstream credentials it protected.
   - Compromised platform admin: remove from `ADMIN_EMAILS` and redeploy; review the audit log for their actions.
   - Active abuse of public endpoints: rate limits and backoff are always on; if insufficient, restrict ingress at Cloud Run while mitigating.
   - Database at risk: take an immediate ad-hoc backup if integrity allows (`gcloud run jobs execute db-backup ... --wait`); if integrity is suspect, preserve the newest good dump instead (bucket history is write-protected from the job path).
3. **Assess impact.** Use the audit log and Cloud Logging to determine which accounts, tenants, and data classes were touched, and the time window.
4. **Eradicate and recover.** Patch the vulnerability, deploy, and where data integrity was affected restore per [docs/ops/db-backup-restore.md](../ops/db-backup-restore.md).
5. **Notify.** For any confirmed exposure of a subscriber's data, inform the affected subscriber(s) without undue delay with facts, impact, and remediation; check applicable breach-notification law (Malaysia PDPA and any contract terms) for timing obligations.
6. **Learn.** Within a week, write a blameless post-incident review: timeline, root cause, what detection missed, and corrective actions; corrective actions become tracked roadmap items and policy updates.

## 5. Communication rules

- One incident commander speaks for the incident; engineering detail stays in the incident note.
- Do not share tenant data, credentials, or exploit detail in notifications.
- Never destroy evidence: logs and audit rows are append-only; keep dumps and notes until the review closes them out.

## 6. Readiness

- The restore drill (quarterly) and the backup failure alert are standing tests of this plan's recovery path.
- The contact list for subscribers is maintained in the platform's account records (Tenant Admin emails).
