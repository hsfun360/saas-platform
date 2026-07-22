# SaaS Platform - Monorepo Instructions Index

This repository holds all the apps and services for the platform.
Shared, cross-cutting rules live here at the root; app-specific docs live in each app's own `CLAUDE.md`.

## Layout

- `apps/web` - Angular frontend (deployed as Cloud Run service `login-web`). See [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md).
- `apps/api` - Node/Express backend (deployed as `login-api`, plus the `login-api-outboxworker`). See [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md).
- `packages/` - shared libraries (added when services are split out of `apps/api`).

## Deploy skills

The deploy runbooks live at the repo root under [`.claude/skills/`](.claude/skills/): `deploy-web`, `deploy-api`, `deploy-worker`.
Each builds from its app subfolder (`docker build ... apps/web` / `apps/api`).

## Documentation

- General working conventions (writing, git, decisions, testing) - [`docs/working-conventions.md`](docs/working-conventions.md)
- Data model map (entities, schemas, ERDs; refreshed via the `data-model` skill) - [`docs/data-model.md`](docs/data-model.md)

@docs/working-conventions.md
