# SaaS Platform — Architecture & Conventions

> Status: LIVING. This is the umbrella doc for how the whole platform fits
> together. Per-service detail lives in the sibling files; see [README.md](README.md).

## What this platform is

A multi-tenant SaaS for clubs. A **subscriber** (Account) has one or more
**Companies** (tenants); each company subscribes to **Modules** (product systems)
and grants **Roles** (RBAC) to its users. On top of that platform run the **core
product systems**: Membership, Golf, Facility.

## Service topology

```
                         ┌──────────────────────────┐
   Angular SPA  ─────────▶        API Gateway        │  (single environment.apiUrl)
   (one app)             └──────────────────────────┘
                              │      │      │      │
        ┌─────────────────────┘      │      │      └────────────────────┐
        ▼                            ▼      ▼                           ▼
  Identity / Auth            System Admin / Control Plane          Core systems
  (owns User, mints JWT)     (owns Account, Company, Role,         Membership · Golf
        │                     Module, Menu, subscriptions)         · Facility
        │                            ▲      ▲                      (own DBs)
        │  JWT (RS256, public key)   │      │ entitlement + context │
        └────────────────────────────┴──────┴───────────────────────┘
                         Notification (outbox → email / Pub/Sub)
```

- **Platform tier**: Identity/Auth, System Administration (Control Plane),
  Notification. Cross-cutting; the product systems depend on them.
- **Product tier**: Membership, Golf, Facility — the core systems. Each owns its
  own data and (eventually) its own database and deployment.

## How services talk to each other

Implemented through one seam: **`src/platform/serviceContext.js`**. Today it runs
in-process (monolith); when a service is split out, only this file's internals
change to HTTP / signed claims — callers are untouched.

- **Who is calling** → `getUserContext(req)` returns `{ userId, email, companyId,
  isSystemAdmin }` from the **verified JWT**. Identity is the source of truth; every
  service just verifies the token with the shared **public key** (RS256). No service
  calls Identity to authenticate a request.
- **Are they entitled** → `requireModule('<Module name>')` middleware: the active
  company must be subscribed to that module (Control-Plane owned). Today an
  in-process lookup; later a Control-Plane API call or a signed entitlements claim.
- **Reading another service's data** → call its HTTP API via
  `internalServiceUrl('<service>')` (env-driven; `null` = in-process today). Never
  `require()` another module's models.
- **Writes / fan-out across services** → publish an event to the transactional
  **outbox** (`platform/outboxMessage.model.js`); the Notification worker (and,
  later, Pub/Sub subscribers) react. Keeps writes atomic and services decoupled.

## Data ownership & the seam to cut

The only association that crosses a service boundary today is **User ↔ Company via
CompanyUser** (`wiring/associations.js`). It is intentionally kept intact in the
monolith. When Identity is extracted, those become **soft UUID references** (no DB
FK) and eager-loads become a token claim or a service call. New product services
**must not** add any new cross-boundary FK — store peer ids as plain UUIDs.

## Auth model

- Only **Identity** mints JWTs (RS256, private key). Claims: `id, email, companyId,
  companyName, isSystemAdmin`.
- Every other service **verifies** with the public key (`platform/jwt.keys.js`,
  `platform/auth.middleware.js`). Future: publish a JWKS endpoint instead of sharing
  the public key by env.

## Frontend strategy

The Angular app stays a **single SPA behind the gateway** — one `environment.apiUrl`.
Its feature areas map to the services (admin/control-plane UI vs. each product), and
it can be split into **micro-frontends** later if needed, independently of the
backend split. The sidebar is already menu-driven by the Control Plane, so adding a
product surfaces by creating its Module + Menus (Modules & Menus admin screen).

## Migration plan (strangler-fig)

1. ✅ Modular monolith (`platform/` + `modules/*` + `wiring/` + `app.js`).
2. ✅ Reserve product seams: `modules/{membership,golf,facility}` stubs + gateway
   mounts + `serviceContext.js` contract. *(this scaffolding)*
3. Extract **Identity/Auth** first (most self-contained); cut User↔Company FK to
   soft UUID refs.
4. Extract **System Administration / Control Plane**.
5. Build the **core systems** behind their reserved seams; give each its own DB.
6. Generalize the outbox worker into a **Notification** service (Pub/Sub on Cloud Run).

Cross-cutting changes still to do: per-service migrations (replace
`sequelize.sync({alter:true})`), JWKS for JWT, a real API gateway.
