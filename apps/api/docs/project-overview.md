# Project Context & Engineering Standards - platform-api

## Project overview

- **Tech stack:** Node.js 24 (CommonJS JavaScript, no TypeScript), Express 5, Sequelize 6 over PostgreSQL, Zod at the request boundary, Docker, Google Cloud Run.
- **What it is:** the modular-monolith API behind the club SaaS - identity and sessions, the control plane (tenancy, RBAC, subscriptions), the product systems (Membership, Golf, AR; Facility stubbed), the shared capabilities (Tax, Dimension, Workflow) and the outbox worker.
  The service map and the per-service specs start at [`docs/systems/README.md`](systems/README.md).
- **Entry points:** `server.js` (the API, all composition in `src/app.js`) and `outboxworker.js` (the worker, same image).

## Development workflows

- **Start the API:** `npm start` (`node server.js`) or `npm run dev` (nodemon).
- **Start the worker locally:** `npm run worker:outbox` (`node outboxworker.js`; `WORKER_MODE=drain` for the scale-to-zero HTTP mode, default `poll`).
- **Run the test suite:** `npm test` (`node --test`; the `*.test.js` files beside their modules - no build step, there is nothing to compile).
- **Seed a fresh/dev database:** `npm run seed` (`scripts/seed.js` forces `RUN_SEED=true`, runs the schema sync plus the DESTRUCTIVE module/menu/role reseed, then exits; the normal boot never seeds).
- **One-off data migrations:** `npm run migrate:menu-routes`, `migrate:platform-users`, `migrate:company-country`, `migrate:addresses`, `migrate:system-admin-module` (plus the ad-hoc `scripts/migrate-*.js` such as the golf closure and player revamps) - run BEFORE the deploy that needs them.
- **Schema changes:** there is no migration tool; the models ARE the schema.
  Boot runs `sequelize.sync({ alter: true })` only when the model fingerprint changed (`src/platform/schemaFingerprint.js`, stored in `public."SchemaMeta"`; `FORCE_SCHEMA_SYNC=1` overrides after manual DDL).
  "Skipping sync (fingerprint match)" in the log is the normal case.
  Renames and drops that the alter-sync cannot express go in a guarded boot block in `src/app.js` or a `scripts/migrate-*.js` run before deploy.
- **Build the container:** `docker build -t platform-api apps/api` (multi-stage `node:24-slim`, production dependencies only, `CMD ["node", "server.js"]`).
- **Run the container locally:** `docker run -p 8080:8080 --env-file .env platform-api`.
- **Deploy:** the CI pipeline builds and deploys `platform-api` and `platform-api-outboxworker` from the same image on push to `dev` (see `docs/ops/cicd.md` at the repo root); the manual runbooks are the `deploy-api` and `deploy-worker` skills under `.claude/skills/`.
