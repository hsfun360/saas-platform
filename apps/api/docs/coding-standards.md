# Coding Standards & Architecture - Login API

## 📐 Coding Guidelines & Architecture
- **Security:** Use bcrypt/argon2 for password hashing. Validate all incoming payloads using a schema validation layer (e.g., Zod).
- **Querying & Architecture:** Strictly use the Repository pattern or a Data Access Layer. Keep all database logic and raw SQL completely isolated from controllers. 
- **Port Binding:** The server must listen on `process.env.PORT` to comply with Cloud Run requirements.
- **Error Handling:** Centralized async middleware to catch errors. Return unified JSON payloads: `{ error: string, details?: any }`.
- **Naming Conventions:** CamelCase for routes and parameters, PascalCase for controllers/classes.
- **Money columns are `numeric(21,2)`:** every DB column holding a currency amount (amounts, fees, charges, credit limits) is declared `DataTypes.DECIMAL(21, 2)` - never `(14,2)` or ad-hoc precisions.
  Percentages/rates are not money and keep their own precision (tax rate `DECIMAL(7,4)`, claim percentage `DECIMAL(5,2)`).
  See docs/systems/saas-platform.md -> "Schema conventions".

## 🔑 Secrets & Configuration (STANDARD - platform-agnostic)
- **The app reads every secret from a plain environment variable** (`process.env.X`), never from a provider-specific SDK or a file path hard-coded to one host.
  This is the 12-factor rule and it keeps the code portable across Cloud Run, plain Docker, Kubernetes, a VM, or local dev - the *host* decides how to populate the env var, the *code* stays the same.
- **Never bake secrets into the Docker image** (no keys, `.env`, or credential files in the build context).
  `.dockerignore` must exclude them. The image is public-by-pull; anything in it leaks.
- **How each host populates the env var:**
  - Google Cloud Run -> Secret Manager, mounted as an env var at deploy: `gcloud run deploy ... --update-secrets JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest`.
  - Docker / Compose -> `-e X="..."` or an `--env-file`.
  - Kubernetes -> a `Secret` surfaced via `env.valueFrom.secretKeyRef`.
  - Local dev -> `apps/api/.env` (git-ignored); code MAY keep a dev-only file fallback, but production must not depend on it.
- **PEM / multi-line secrets:** accept the value whether newlines are real or escaped as literal `\n` (some hosts flatten multi-line env vars), so one value works everywhere.
- **Reference implementation:** [`src/platform/jwt.keys.js`](../src/platform/jwt.keys.js) - env-var PEM -> env-var path -> local `keys/` file, in that order. Copy this shape for any new secret.

## 🛑 Project Constraints & Anti-Patterns
- **Do NOT:** Save plain-text passwords or log JWT tokens to the console.
- **Do NOT:** Write inline raw PostgreSQL queries directly into Express routes.
- **Do NOT:** Store state, sessions, or files on the local container filesystem (Cloud Run is stateless and ephemeral).
- **Type Safety:** The `any` type is strictly forbidden. All raw PostgreSQL responses must be parsed and mapped to precise TypeScript interfaces (consider using Zod or a type-safe query builder like Kysely).
