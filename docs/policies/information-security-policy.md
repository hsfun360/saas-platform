# Information Security Policy

| | |
| --- | --- |
| Owner | [OWNER - accountable executive] |
| Effective | 2026-07-29 |
| Review | Annually, and after significant architecture changes |
| Status | Active |

## 1. Purpose and commitment

This policy establishes how the organization protects the confidentiality, integrity, and availability of the SaaS club-management platform and the data our subscribers entrust to it.
Management is committed to providing the resources needed to operate these controls and to improving them continually.

## 2. Scope

- The multi-tenant SaaS platform in the `saas-platform` monorepo: the Angular frontend (`login-web`), the Node/Express API (`login-api`), and the outbox worker (`login-api-outboxworker`), all deployed on Google Cloud Run.
- The PostgreSQL database holding all platform and tenant data, currently self-hosted on a dedicated Windows host.
- Supporting cloud services: Google Secret Manager, Artifact Registry, Cloud Storage (backups), Cloud Scheduler, Cloud Logging/Monitoring.
- All personnel and AI-assisted development sessions that change or operate the platform.

## 3. Security objectives

1. Tenant data is isolated: one subscriber can never read or affect another subscriber's data.
2. Only authenticated, authorized users act on the platform, with least privilege enforced by roles.
3. Every material action is attributable (audit trail) and every secret is managed, never hard-coded.
4. The platform can be restored from backup within a working day with at most 24 hours of data loss.
5. Vulnerabilities are found and fixed proactively (dependency updates, scanning, planned external testing).

## 4. Organization and responsibilities

- **Platform owner** `[OWNER]` is accountable for this policy, risk acceptance, and incident command.
- **Platform engineering** implements and operates controls, maintains the policy pack, and reviews audit logs and alerts.
- **Subscribers (Tenant Admins)** manage their own users, roles, and data inside their tenancy; the platform team manages only the subscription contract (plan, status, entitlements) and never tenant business data - the sole exception is Tenant Admin account recovery.

## 5. Policy framework

The detailed rules live in the topic policies listed in [README.md](README.md); together with this document they form the information security policy pack.
Engineering-facing security detail is maintained alongside the code in `apps/api/docs/security-hardening.md` and the ops runbooks under `docs/ops/`.

## 6. Risk management

- Risks are identified continuously during development and recorded as roadmap items with explicit triggers (see "Known gaps" in the README).
- A risk may be accepted only by the platform owner, and the acceptance must be recorded in the relevant policy or roadmap note.
- Security work is prioritized ahead of feature cost considerations, in line with the repository's working conventions.

## 7. Compliance and review

- This pack is reviewed at least annually; each document records its own review cadence.
- Material deviations found in review or audit are treated as incidents or corrective actions per the [Incident Response Plan](incident-response-plan.md).
