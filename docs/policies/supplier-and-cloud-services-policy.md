# Supplier & Cloud Services Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually |
| Status | Active |

## 1. Supplier register

| Supplier | Service | Data exposed | Notes |
| --- | --- | --- | --- |
| Google Cloud | Cloud Run, Secret Manager, Cloud Storage (backups), Artifact Registry, Scheduler, Logging/Monitoring | All application traffic, secrets, backups | ISO 27001/SOC 2 certified provider; project `membership-project-199610` |
| Azure-hosted DB host (administered by [HOST ADMIN]) | Self-hosted PostgreSQL server | The production database | Patching and disk encryption owned by host admin; TLS enablement pending |
| Google / Microsoft identity | SSO (OAuth/OIDC) | Email, name, avatar of consenting users | No passwords ever transit the platform for SSO users |
| Have I Been Pwned | Breached-password range API | 5-character SHA-1 prefixes only (k-anonymity, padded) | Fail-open; no PII leaves the platform |
| GitHub | Source hosting, Dependabot | Source code (no secrets committed) | |
| Subscriber SMTP providers | Outbound tenant email | Tenant email content | Configured and owned per company by the subscriber; credentials stored AES-256-GCM encrypted |
| disposable-email-domains (npm) | Bundled blocklist data | None (offline list) | Vendored at build time; no runtime calls |

## 2. Selection and review

- New suppliers handling tenant data or secrets require: a recognized security certification (or equivalent published posture), data-location review against the residency notes in the [Data Classification & Retention Policy](data-classification-and-retention-policy.md), and an entry in the register above - in the same change that introduces them.
- Dependencies (npm) are suppliers too: additions are reviewed for maintenance health, and monitored continuously via Dependabot and container scanning.
- The register is reviewed annually alongside this policy.

## 3. Exit strategy

- The application is 12-factor and platform-agnostic (secrets via env vars, standard containers), so it can move providers by re-pointing the deploy runbooks.
- The database is standard PostgreSQL; backups are provider-independent `pg_dump` archives readable anywhere.
- The largest switching dependency is Google Secret Manager + Cloud Run IAM wiring, which the deploy runbooks document end-to-end.
