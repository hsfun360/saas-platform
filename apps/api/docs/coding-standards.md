# Coding Standards & Architecture - platform-api

## Coding guidelines & architecture

- **Language:** CommonJS JavaScript on Node 24 - no TypeScript, no build step.
  Keep modules small and lazy-require across module folders only through the seams (below).
- **Layout:** `src/platform/` (cross-cutting seams and infrastructure), `src/modules/<service>/` (one folder per service: `*.model.js`, `*.routes.js`, `*.controller.js`, `*.service.js`, `*.constants.js`, `*.schemas.js`), `src/wiring/` (associations and composition-time registries), `src/app.js` (the composition root).
- **Security:** bcrypt for password hashing.
  Validate every incoming request part with the Zod seam `src/platform/validate.js` - `validate({ params, query, body })` with a schema from the `*.schemas.js` file beside the controller; every new endpoint that reads a request part mounts it.
  Zod runs only at the HTTP boundary; internal functions and gateways are never wrapped.
- **Querying & architecture:** Sequelize models are the data layer; controllers call models and services, never raw SQL inline in a route.
  Raw queries are reserved for boot migrations in `app.js`, reconciliation reads and the few hot-path aggregates in services.
  Cross-module reads go through `src/platform/*Gateway.js` and `serviceContext.js`, never a `require()` of another module's models (golden rule 4 in `docs/systems/README.md`).
- **Authorization on every product route:** `verifyToken` + `requireModule('<Module.code>')` on the router, `requireMenuAction('<screen route>')` per screen, `canModifyRecord` / `annotateCanModify` on update paths, and the three ownership stamps (`createdBy`, `createdByDepartmentId`, `updatedBy`) on every new product table.
- **Port binding:** the server must listen on `process.env.PORT` (default 8080) on `0.0.0.0` to comply with Cloud Run.
- **Error handling:** controllers catch their own errors and return unified JSON payloads `{ message: string, details?: any }` - `message` is what the web's flash snackbar shows; the validation seam returns `400 { message, details: [{ field, message }] }`; services throw errors carrying `httpStatus` for the controller to map.
  Never echo the raw payload back.
- **Naming conventions:** camelCase for routes, parameters and columns; PascalCase for models and classes; kebab-case URL segments; fixed vocabularies live in `*.constants.js` as `{ key, label }` lists that the API validates against AND serves via `/meta` so dropdowns never drift.
- **Money columns are `numeric(21,2)`:** every DB column holding a currency amount (amounts, fees, charges, credit limits) is declared `DataTypes.DECIMAL(21, 2)` - never `(14,2)` or ad-hoc precisions.
  Percentages/rates are not money and keep their own precision (tax rate `DECIMAL(7,4)`, claim percentage `DECIMAL(5,2)`).
  See docs/systems/saas-platform.md -> "Schema conventions".
- **Transactions:** a business write and its outbox event (or its numbering issue) commit together; gapless numbers issue INSIDE the business transaction through `platform/numberingGateway.js`.

## Secrets & configuration (STANDARD - platform-agnostic)

- **The app reads every secret from a plain environment variable** (`process.env.X`), never from a provider-specific SDK or a file path hard-coded to one host.
  This is the 12-factor rule and it keeps the code portable across Cloud Run, plain Docker, Kubernetes, a VM, or local dev - the *host* decides how to populate the env var, the *code* stays the same.
- **Never bake secrets into the Docker image** (no keys, `.env`, or credential files in the build context).
  `.dockerignore` must exclude them.
  The image is public-by-pull; anything in it leaks.
- **How each host populates the env var:**
  - Google Cloud Run -> Secret Manager, mounted as an env var at deploy: `gcloud run deploy ... --update-secrets JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest`.
  - Docker / Compose -> `-e X="..."` or an `--env-file`.
  - Kubernetes -> a `Secret` surfaced via `env.valueFrom.secretKeyRef`.
  - Local dev -> `apps/api/.env` (git-ignored); code MAY keep a dev-only file fallback, but production must not depend on it.
- **PEM / multi-line secrets:** accept the value whether newlines are real or escaped as literal `\n` (some hosts flatten multi-line env vars), so one value works everywhere.
- **Reference implementation:** [`src/platform/jwt.keys.js`](../src/platform/jwt.keys.js) - env-var PEM -> env-var path -> local `keys/` file, in that order.
  Copy this shape for any new secret.

## Project constraints & anti-patterns

- **Do NOT:** save plain-text passwords or log JWT tokens to the console.
- **Do NOT:** write inline raw PostgreSQL queries directly into Express routes.
- **Do NOT:** store state, sessions, or files on the local container filesystem (Cloud Run is stateless and ephemeral) - sessions are DB rows, uploads go to GCS through multer in-memory storage.
- **Do NOT:** add a cross-service Sequelize association or DB foreign key; store peer ids as plain UUIDs.
- **Do NOT:** gate anything on a module's display name - `requireModule()` and every module-keyed seam take the frozen `Module.code`.
- **Do NOT:** hand-edit the schema outside the models without `FORCE_SCHEMA_SYNC=1` on the next boot, or the fingerprint gate will keep skipping the sync.
