# Information Security Policy Pack

This folder is the platform's ISO 27001-oriented policy document pack.
Every policy describes controls as they are actually implemented in this repository and its cloud environment; anything not yet built is explicitly marked **Planned** with its trigger.
Keep it that way: when an auditor (or a pen tester) checks a claim, the claim must hold.

## Documents

| Policy | Covers (ISO 27001:2022 Annex A themes) |
| --- | --- |
| [Information Security Policy](information-security-policy.md) | Governance, scope, roles, commitment (5.1-5.4) |
| [Access Control Policy](access-control-policy.md) | Identity, authentication, RBAC, privileged access (5.15-5.18, 8.2-8.5) |
| [Cryptography & Secrets Policy](cryptography-and-secrets-policy.md) | Encryption in transit/at rest, key and secret management (8.24) |
| [Backup & Recovery Policy](backup-and-recovery-policy.md) | Backups, restore testing, continuity (8.13, 8.14) |
| [Incident Response Plan](incident-response-plan.md) | Detection, response, communication, learning (5.24-5.28, 6.8) |
| [Change & Release Management Policy](change-and-release-management-policy.md) | Change control, deployment, segregation (8.31, 8.32) |
| [Logging, Monitoring & Audit Policy](logging-monitoring-and-audit-policy.md) | Audit trails, monitoring, alerting, clock sync (8.15-8.17) |
| [Vulnerability & Patch Management Policy](vulnerability-and-patch-management-policy.md) | Dependency updates, scanning, pen testing (8.8) |
| [Data Classification & Retention Policy](data-classification-and-retention-policy.md) | Data classes, tenant isolation, retention, disposal (5.9-5.14, 8.10-8.12) |
| [Supplier & Cloud Services Policy](supplier-and-cloud-services-policy.md) | Cloud providers and third-party services (5.19-5.23) |

## Conventions

- Each document carries an owner, an effective date, and a review cadence in its header table.
  Review every policy at least annually and after any significant architecture change.
- `[OWNER]` placeholders must be replaced with a named accountable person before certification audit.
- Statements of fact reference their implementation (file, service, or runbook) so drift is detectable.
- Update the relevant policy in the same commit as the change that affects it, the same way `docs/security-hardening.md` is maintained.

## Known gaps (tracked, deliberate)

These are acknowledged in the relevant policies and tracked as roadmap items rather than hidden:

- Database connections are not yet TLS-encrypted (server-side `ssl` is off on the self-hosted Postgres host).
  Client support is already coded; enabling is a pending infrastructure task.
- No WAF / custom domain yet; parked as one pre-launch milestone (Cloud Armor + external HTTPS LB + domain).
- External penetration test scheduled after the WAF milestone so it exercises the production topology.
- Full-disk encryption status of the self-hosted database host must be confirmed with its administrator.
