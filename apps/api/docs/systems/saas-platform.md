# SaaS Platform - Architecture & Conventions

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
- **Product tier**: Membership, Golf, Facility - the core systems. Each owns its
  own data and (eventually) its own database and deployment.

## How services talk to each other

Implemented through one seam: **`src/platform/serviceContext.js`**. Today it runs
in-process (monolith); when a service is split out, only this file's internals
change to HTTP / signed claims - callers are untouched.

- **Who is calling** → `getUserContext(req)` returns `{ userId, email, companyId,
  isSystemAdmin }` from the **verified JWT**. Identity is the source of truth; every
  service just verifies the token with the shared **public key** (RS256). No service
  calls Identity to authenticate a request.
- **Are they entitled** → `requireModule('<Module name>')` middleware: the active
  company must be subscribed to that module (Control-Plane owned). Today an
  in-process lookup; later a Control-Plane API call or a signed entitlements claim.
- **May they perform this action** → `requireMenuAction('<screen route>')`
  middleware (RBAC): the caller's role must hold a grant to the screen
  (`Menu.route`), and the HTTP method maps to the granted action flag
  (GET view / POST create / PUT+PATCH edit / DELETE delete - `RoleMenu.canCreate/canEdit/canDelete`).
  Tenant Admin and platform admins bypass; a route not in the Menu catalogue
  enforces nothing.
  Every product route group MUST wire this beside `requireModule` (reference:
  `modules/membership/membership.routes.js`).
- **Whose records may they amend** → the data-scope helpers
  (`getAccessContext`, `getCallerPlacement`, `canModifyRecord`,
  `annotateCanModify`): a role's `dataScope` (`own` / `department` / `all`)
  bounds Edit/Delete against the record's ownership stamps
  (`createdBy`, `createdByDepartmentId`; every save also stamps `updatedBy`).
  The department rule is same-department AND strictly-senior (`Position.rank`).
  Controllers enforce with `canModifyRecord()` on update paths, stamp on create,
  and return a per-row `canModify` (from `annotateCanModify()`) so the UI hides
  actions the caller cannot use.
  Full rule + reference implementation (the membership masters):
  [system-administration.md](system-administration.md).
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
**must not** add any new cross-boundary FK - store peer ids as plain UUIDs.

### Schema conventions

- **Money/amount columns are `numeric(21,2)`** (`DataTypes.DECIMAL(21, 2)` in the model): amounts, fees, charges, credit limits - any value denominated in a currency.
  The previous `numeric(14,2)` columns have been widened; `sequelize.sync({ alter: true })` applies the widening on boot, and it is lossless.
  Percentages and rates are NOT money and keep their own precision (e.g. tax rate `DECIMAL(7,4)`, claim percentage `DECIMAL(5,2)`).
- **Every new product table carries the ownership stamps** `createdBy` (UUID, nullable), `createdByDepartmentId` (UUID, nullable - the creator's department at creation) and `updatedBy` (UUID, nullable, stamped on every save).
  They power the RBAC data scope (see "How services talk to each other") and are groundwork for the planned user-defined workflow engine.
  Prefer explicit status/state columns over booleans for records a future approval flow may govern.

## Auth model

- Only **Identity** mints JWTs (RS256, private key). Claims: `id, email, companyId,
  companyName, isSystemAdmin`.
- Every other service **verifies** with the public key (`platform/jwt.keys.js`,
  `platform/auth.middleware.js`). Future: publish a JWKS endpoint instead of sharing
  the public key by env.

## Frontend strategy

The Angular app stays a **single SPA behind the gateway** - one `environment.apiUrl`.
Its feature areas map to the services (admin/control-plane UI vs. each product), and
it can be split into **micro-frontends** later if needed, independently of the
backend split.

**Systems = Modules, surfaced by granted Menus.** Each system (Membership, Golf,
Facility, Platform) is a top-level route namespace with its own landing dashboard,
reached from the **apps switcher** in the top bar (active system lives in the URL).
The shell is **menu-driven by the Control Plane**, so:

- A system appears in the apps switcher **only once the logged-in role has at least
  one Menu granted in that Module** (the switcher list is built from the user's
  granted menus). So to surface Golf / Membership / Facility: create the Module +
  a Menu for it (**Modules & Menus** admin screen) and grant that menu to a role
  (**Role Management**). Creating the Module alone is not enough.
- The per-system **dashboards are always reachable directly by route**
  (`/golf`, `/membership`, `/facility`, `/platform`) regardless of menus.
- Landing routes are currently a hard-coded map in `dashboard.ts` (`moduleLanding`);
  the planned **Stage 2b** moves this to a Control-Plane `Module.landingRoute` field.
- Possible follow-up: also list a **subscribed-but-menu-less** system in the switcher
  (today it requires ≥1 granted menu).

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
