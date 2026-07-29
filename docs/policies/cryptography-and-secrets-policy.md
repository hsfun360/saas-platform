# Cryptography & Secrets Policy

| | |
| --- | --- |
| Owner | [OWNER] |
| Effective | 2026-07-29 |
| Review | Annually |
| Status | Active |

## 1. Encryption in transit

- All user-facing traffic terminates on HTTPS (TLS managed by Google Cloud Run) for the web app and the API.
- The outbox worker's ingress is restricted to internal traffic; it is not reachable from the internet.
- SMTP sending uses the transport security configured per company mail server.
- **Planned:** the API-to-database connection is not yet TLS-encrypted because the self-hosted PostgreSQL server runs with `ssl` off.
  The client side is already implemented (`DB_SSL` in `apps/api/src/platform/db.js`); enabling server TLS and setting `DB_SSL=require` on api and worker is a tracked infrastructure task.

## 2. Encryption at rest

- Google-managed encryption at rest covers Cloud Storage (backups), Artifact Registry (images), Secret Manager, and Cloud Logging.
- Application-layer encryption protects the most sensitive stored fields over and above disk encryption: per-company SMTP passwords (AES-256-GCM under `SMTP_ENCRYPTION_KEY`) and TOTP MFA secrets (encrypted under `MFA_ENCRYPTION_KEY`).
- Password and token material is stored only as hashes: user passwords (bcrypt), refresh tokens, password-reset and email-verification tokens (SHA-256), and MFA recovery codes.
- **To confirm:** full-disk encryption status of the self-hosted database host must be verified with its administrator and recorded here.

## 3. Key and secret management

- Every production secret lives in Google Secret Manager and reaches the application only as an environment variable at deploy time: `DATABASE_URL`, JWT RS256 key pair, `MFA_ENCRYPTION_KEY`, `SMTP_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, and SMTP/email credentials.
- Secrets are never baked into container images, committed to git, or logged; `.dockerignore` and `.gitignore` enforce the boundaries (`keys/`, `.env`).
- The code reads secrets only from `process.env` (12-factor), so the same images run on any host that injects the variables.
- Local development keys under `apps/api/keys/` are development-only and git-ignored.
- Encryption keys must be identical across environments that share a database (learned incident: MFA secrets encrypted under one key are undecryptable under another).

## 4. Key rotation

- JWT keys rotate by adding a new Secret Manager version and redeploying; the previous version is retained until all tokens signed with it have expired (max 7 days), then disabled.
- Symmetric application keys (`MFA_ENCRYPTION_KEY`, `SMTP_ENCRYPTION_KEY`) rotate by re-encrypting stored values under the new key before the old version is disabled.
- Rotation is performed on suspicion of compromise, on personnel departure with access, or at need; each rotation is recorded in the change history (git + Cloud Run revisions).

## 5. Approved algorithms

- Asymmetric signing: RSA 2048+ (RS256).
- Symmetric encryption: AES-256-GCM.
- Password hashing: bcrypt with per-password salt.
- General hashing of high-entropy tokens: SHA-256.
- No custom or homegrown cryptography is permitted.
