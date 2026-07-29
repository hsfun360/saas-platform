# Logging, Monitoring & Audit Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually |
| Status | Active |

## 1. Application audit trail

- Every create/update/delete on audited models is recorded automatically by global Sequelize hooks into the append-only `audit."AuditLog"` table (own `audit` schema), committed only with the business transaction (`afterCommit`).
- Each entry records the acting user (verified who-context from the JWT), tenant scope, model, record id, and the changed fields.
- Sensitive values are redacted before storage (passwords, tokens, secrets never appear in audit rows).
- New tables are audited automatically; bulk operations that bypass hooks must be converted to hooked equivalents (standing rule; `changePassword` was the reference conversion).
- Audit logging is fail-open by design: an audit-write failure never blocks the business action, so availability is not held hostage to the log path.

## 2. Who can see what

- Platform administrators view the platform-wide trail at `/admin/audit-log`.
- Tenant Admins view their own tenancy's trail (audit scope `account`) through the tenant Audit Log screen - transparency without cross-tenant exposure.
- Audit rows are append-only; no application path exists to edit or delete them.

## 3. Infrastructure logs

- Cloud Run captures stdout/stderr for `login-api`, `login-web`, the outbox worker, and the `db-backup` job into Cloud Logging with Google-managed retention.
- JWTs, passwords, and secrets are never written to logs (enforced coding standard).
- Clock synchronization is inherited from the cloud platform (Cloud Run) and the database host's OS time service; audit timestamps come from the API host.

## 4. Monitoring and alerting

- Cloud Monitoring alerts on backup-job failures (email to the operations address); the alert catalogue grows with the platform - new critical asynchronous paths must ship with a failure alert, like the backup job did.
- Rate-limit and backoff mechanisms log their triggers, giving early signal of brute-force and abuse attempts.
- Dependabot and Artifact Registry scanning findings surface through GitHub and the Google Cloud console respectively and are triaged per the [Vulnerability & Patch Management Policy](vulnerability-and-patch-management-policy.md).

## 5. Review

- The platform-wide audit log and alert history are reviewed after any incident and during the quarterly backup drill session (a natural recurring checkpoint).
- Findings that indicate a control gap become roadmap items or incidents per the [Incident Response Plan](incident-response-plan.md).
