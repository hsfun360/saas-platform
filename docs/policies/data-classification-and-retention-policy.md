# Data Classification & Retention Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually |
| Status | Active |

## 1. Data classes

| Class | Examples | Handling |
| --- | --- | --- |
| Secrets | Connection strings, signing keys, encryption keys, SMTP passwords, TOTP secrets | Secret Manager or application-layer encryption; never in code, images, logs, or audit rows |
| Credentials & tokens | Password hashes, refresh tokens, reset/verification tokens, recovery codes | Stored only as hashes; single-use where applicable |
| Tenant personal data | Member/nominee/dependent records (names, NRIC-type identifiers, addresses, contacts), user profiles, sales-agent data | Tenant-scoped, RBAC-gated, audit-logged; platform staff do not access it (contract-only rule) |
| Tenant business data | Memberships, fees, bookings, billing configuration | Same handling as tenant personal data |
| Platform data | Accounts, companies, entitlements, modules/menus, reference data | Platform-admin managed, audit-logged |
| Telemetry | Application logs, audit trail, alerts | No secrets or tokens; redaction enforced at the audit layer |

## 2. Tenant isolation

- All tenant data carries the owning `accountId` (or hangs off a company that does) and every tenant query is scoped by it; platform-level rows use the NULL-discriminator pattern with partial unique indexes.
- Cross-service references use plain UUIDs (no cross-schema foreign keys), keeping ownership boundaries explicit.
- One database serves all tenants today; isolation is enforced at the application layer and verified through RBAC seams (`requireModule`, `requireMenuAction`, data scopes).

## 3. Residency and location

- Application and backups: Google Cloud `asia-southeast1` (Singapore).
- Database: self-hosted host in a Southeast Asia region (Azure-hosted Windows server).
- Subscribers with residency requirements are handled contractually; the current footprint is single-region by design.

## 4. Retention

| Data | Retention |
| --- | --- |
| Tenant business/personal data | Life of the subscription contract; disposition on termination is per contract (export then delete on request) |
| Audit trail | Retained indefinitely for now (append-only, own schema so a retention window can be applied independently later) |
| Database backups | 30 days daily, 365 days monthly, enforced by bucket lifecycle (see [Backup & Recovery Policy](backup-and-recovery-policy.md)) |
| Unverified registrations | Reviewed and deleted via the admin utility once stale (default review threshold 7 days) |
| Cloud logs | Google Cloud Logging default retention |
| Email outbox rows | Retained as the delivery record of transactional mail |

## 5. Deletion and disposal

- Account-level deletion (subscription termination) removes tenant data on request after any contractual export; deletion actions themselves are audit-logged.
- Unverified-user cleanup re-validates server-side (still unverified, zero workspaces, not break-glass) before deleting, and frees the email address.
- Backup copies age out automatically through lifecycle rules; no manual purge path exists, so accidental or malicious mass deletion of history is not possible via the application or the backup job.
- Media disposal for the self-hosted database host is the host administrator's responsibility and follows the provider's decommissioning process.

## 6. Privacy notes

- Personal data of club members is processed on behalf of subscribers (the clubs); the platform acts as processor and the subscriber as controller in PDPA terms.
- Data subject requests arriving at the platform are routed to the owning subscriber's Tenant Admin.
- No personal data is placed in URLs; email links carry only opaque single-use tokens and point at the frontend, never the API host.
