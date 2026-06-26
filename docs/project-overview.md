# Project Context & Engineering Standards - Frontend Login App

## 🎯 Project Overview
- **Tech Stack:** Angular v21.2.4 (Zoneless, Standalone Components, Signals).
- **Core Functionality:** User authentication UI, registration flow, and JWT token storage.

## 🛠️ Development Workflows
- Start dev server: `ng serve`
- Production build: `ng build --configuration production`
- Run unit tests: `ng test`
- Lint code: `ng lint`

## 📐 Coding Guidelines & Architecture
- **State Management:** Use Angular Signals for component state. Use a dedicated `AuthService` (Signals-based) to track login states.
- **Forms:** Use Angular 21 Signal Forms for login and registration inputs.
- **Change Detection:** Strictly Zoneless. No dependency on `zone.js`.
- **Component Design:** Every component must be `standalone: true`.
- **Naming Conventions:** Follow standard Angular style (`*.component.ts`, `*.service.ts`, `*.guard.ts`).

## 🛑 Project Constraints & Anti-Patterns
- **Do NOT:** Implement any hardcoded API fallback keys locally.
- **Do NOT:** Use legacy `NgModules` or inject `ChangeDetectorRef`.
- **Security:** Never store raw passwords or sensitive payload structures in local logs.
- **Type Safety:** Enforce `strictNullChecks`. The `any` type is banned.

## UI/UX Requirements
- ALL user interfaces MUST be mobile-responsive
- Use mobile-first design approach
- Test layouts at 320px, 768px, and 1024px+ breakpoints
- Touch targets minimum 44x44px
- Use relative units (rem, %, vh/vw) instead of fixed pixels
- Stack layouts vertically on mobile, horizontal on desktop
- Body/primary text is min 16px on mobile (`--font-body`). Secondary text follows
  the type scale — Body-2 14px, Caption 12px, Overline 10px — and must never carry
  primary reading content. Form inputs are always ≥ 16px (also prevents iOS zoom).
- Add appropriate viewport meta tags
- Test all interactive elements for touch accessibility (interactive targets ≥ 44×44px)

### Responsive component patterns
All UI components you generate MUST follow these patterns:
- **Layout:** Single column on mobile, multi-column on desktop
- **Navigation (adaptive — one source of destinations, container changes by width):**
  - Primary destinations: a **bottom navigation bar** on mobile, a **persistent side nav** on desktop.
  - Secondary destinations: a **hamburger-toggled drawer** on mobile that becomes part of the **side nav** on desktop.
  - Bottom nav is for navigation **destinations only** — use in-page buttons / a FAB for actions, never put actions in the bottom bar.
- **Buttons:** Use the shared `.btn` system (see "Button system" below). Full-width
  primary CTAs on mobile (auto/content width on desktop); every button keeps a ≥ 44px
  touch target at all widths. Do **not** hand-roll one-off inline button styles.
- **List/card row actions:** Info on the left, action buttons on the right at the same
  level on desktop; on mobile the actions drop to a full-width row below, left-justified
  (see "List/card action-row layout" below).
- **Spacing & font scale:** Use the mobile-first scales below. They are exposed
  as CSS custom properties in `src/styles.css` (`--font-*`, `--space-*`, `--weight-*`) —
  prefer those tokens over hard-coded `px` values.

#### Typography scale (mobile-first)

| Level | Size | Weight | CSS var | Used for |
| --- | --- | --- | --- | --- |
| Display / Hero | 32–40px (2–2.5rem) | Bold/Black | `--font-display` | Login screens, empty states, major headings |
| H1 — Page title | 24–28px (1.5–1.75rem) | Bold | `--font-h1` | Dashboard, Settings, main screens |
| H2 — Section header | 20–22px (1.25–1.375rem) | Semibold | `--font-h2` | Card titles, section headers |
| H3 — Subsection | 18px (1.125rem) | Medium | `--font-h3` | Form labels, list group headers |
| Body — Primary | 16px (1rem) | Regular | `--font-body` | Main content, paragraphs, buttons (**a11y minimum**) |
| Body 2 — Secondary | 14px (0.875rem) | Regular | `--font-body-2` | Descriptions, helper text, captions |
| Caption — Metadata | 12px (0.75rem) | Regular | `--font-caption` | Timestamps, labels, badges |
| Overline — Micro | 10px (0.625rem) | Uppercase/Bold | `--font-overline` | Section markers, status indicators |

#### Spacing scale (8pt grid)

| Token | Size | CSS var | Used for |
| --- | --- | --- | --- |
| xs | 4px (0.25rem) | `--space-xs` | Tiny gaps, icon-to-text spacing |
| sm | 8px (0.5rem) | `--space-sm` | Compact items, list item padding |
| md | 16px (1rem) — **default** | `--space-md` | Standard / card padding, list item spacing |
| lg | 24px (1.5rem) | `--space-lg` | Section spacing, form group separation |
| xl | 32px (2rem) | `--space-xl` | Screen padding, major sections |
| 2xl | 48px (3rem) | `--space-2xl` | Hero sections |
| 3xl | 64px (4rem) | `--space-3xl` | Page top/bottom breathing room |

#### Button system (shared component)

There is **one** button component, defined globally in `src/styles.css`. Always use it
instead of inline-styling a `<button>` — this keeps every screen visually consistent,
guarantees the a11y touch target, and means a future restyle is a one-file change.

| Class | Use for |
| --- | --- |
| `.btn` | **Base — always required.** Provides the ≥ 44px touch target, padding, radius, focus styles, disabled state, and icon spacing. |
| `.btn--primary` | The main call to action (Save, Create, Update, Add). |
| `.btn--secondary` | Lower-emphasis / bordered actions (Edit, Cancel). |
| `.btn--danger` | Destructive actions (Delete, Remove, Revoke). |
| `.btn--link` | Looks like an inline text link but keeps the 44px target + a11y. |
| `.btn--sm` | Modifier: denser padding/text for inline row actions (still 44px tall). |
| `.btn--block` | Modifier: full width (primary CTAs, esp. on mobile). |

Rules:
- Compose a base + one colour + optional modifiers, e.g.
  `class="btn btn--secondary btn--sm"` or `class="btn btn--primary btn--block"`.
- Pick the colour by **intent**, not by look: destructive actions are always `.btn--danger`.
- Icon-in-button: put a `<span class="material-icons" aria-hidden="true">…</span>` inside;
  `.btn` already spaces it. Icon-only buttons still need an `aria-label`.
- `button[type="submit"]` and `.btn--block` go full-width on mobile automatically.
- The auth screens (login / reset / forgot / system-setup) keep their own scoped
  `.btn-primary` (single-dash) for their centred-card layout — don't confuse the two.

#### List/card action-row layout (adaptive)

The standard for any list/card where a row has **content + actions** (e.g. Companies,
Role Management, User Management). One source of truth; the container reflows by width:

- **Desktop (≥ 768px):** content on the left, action buttons on the right **at the same
  level** as the content.
- **Mobile (≤ 767px):** the actions drop to a **full-width row below the content,
  left-justified**.

Implement it with a CSS-grid class (named areas), **not** inline styles — the global
mobile rule collapses any *inline* `grid-template-columns` to one column, so an inline
grid here would break on desktop. Pattern:

```css
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;  /* see note on minmax below */
  grid-template-areas: "main actions";   /* + "main badge" rows if a status chip is present */
  align-items: center;
  gap: var(--space-sm);
}
.row__main    { grid-area: main; min-width: 0; }          /* min-width:0 lets long text wrap */
.row__actions { grid-area: actions; justify-self: end; display: flex; gap: var(--space-xs); flex-shrink: 0; }

@media (max-width: 767px) {
  .row { grid-template-columns: 1fr; grid-template-areas: "main" "actions"; }
  .row__actions { justify-self: start; }   /* bottom-left on mobile */
}
```

Notes:
- Use **`minmax(0, 1fr)`**, not bare `1fr`, for the main track. A plain `1fr` track has a
  default minimum of `min-content`, so its content can't shrink past that and **overflows /
  overlaps the actions cell** on long rows. This bites hardest when the main cell is a
  `<button>` (e.g. a clickable list item), because a button's intrinsic minimum size
  **ignores `min-width: 0`** during track sizing — `minmax(0, 1fr)` forces the minimum to 0
  so the text wraps. Also avoid `width: 100%` on a button in the main cell (it feeds the
  button's preferred width back into track sizing — let it fill via the default `stretch`).
- Keep expanding panels / edit forms as **full-width siblings below** the grid row, not
  inside it, so they span the whole card.
- Reference implementations: `companies.css` (`.company-*`, with a status badge),
  `role-management.css` (`.role-*`), `tenant-users.css` (`.assign-row*`),
  `modules-menus.css` (`.mm-row*`, with a `<button>` main cell).

#### Master–detail screens (sliding pane + URL state)

For any screen with a **list (master) → item detail (detail)** relationship (e.g. Modules
& Menus), use the web equivalent of a `SlidingPaneLayout` + `NavigationStack`:

- **Layout (CSS only):** a grid container with two panes — master + detail **side-by-side
  on desktop**, and **one-at-a-time on mobile**. On mobile the master list shows by default;
  once an item is open the **detail covers the master**, with a mobile-only "← Back" button
  that returns to the list. Toggle a container class from the selection state:
  `<div class="mm-layout" [class.mm-layout--detail]="selectedId()">`.
- **State (URL is the single source of truth):** put the selected item's id in the **route**
  (`/section/:id`), not just a signal. Add both `path: 'section'` and `path: 'section/:id'`
  pointing at the same component; read the param via `route.paramMap` and derive the
  selection from it; navigate (don't mutate the signal directly) to change selection. This
  gives **deep linking** and working **browser back/forward** for free. Return to the master
  list by navigating to the param-less base path.

```css
.mm-layout { display: grid; grid-template-columns: minmax(0, 420px) 1fr; gap: var(--space-lg); align-items: start; }
.mm-back   { display: none; }                      /* mobile-only back button */

@media (max-width: 768px) {
  .mm-layout { grid-template-columns: 1fr; }
  .mm-pane--detail { display: none; }              /* default: master visible */
  .mm-layout--detail .mm-pane--master { display: none; }
  .mm-layout--detail .mm-pane--detail { display: block; }   /* detail covers master */
  .mm-back { display: inline-flex; }
}
```

```ts
// selection flows FROM the url, not the other way around
this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(p => this.applySelection(p.get('id')));
select(id: string) { this.router.navigate(['/section', id]); }   // never set the signal directly
back()             { this.router.navigate(['/section']); }
```

Reference implementation: `modules-menus.ts` + `modules-menus.css` (`.mm-layout`, `.mm-pane--*`,
`.mm-back`), routed as `modules-menus` and `modules-menus/:moduleId`.

#### Section tabs (responsive strip + URL-driven)

For a screen split into a handful of top-level **sections** (e.g. SaaS Administration:
New Subscriber / Subscribers / Roles / Users / Assign Role), use an **underline tab strip
that scrolls horizontally**, with the active tab in the **URL**.

- **Responsive (CSS):** a single-row flex strip with `overflow-x: auto` + `scroll-snap`,
  hidden scrollbar, and `flex: 0 0 auto` tabs that never shrink — so on a phone you swipe
  and a partially-visible tab at the edge signals there's more. Active tab = a coloured
  `border-bottom` (not a pill). Every tab keeps a ≥ 44px touch target and `white-space:
  nowrap`. **Don't** use a non-wrapping, non-scrolling flex row (it clips on mobile).
- **URL-driven (same rule as master–detail above):** the active tab is a route segment
  (`/section/:tab`), so tabs are deep-linkable and survive a refresh. Read it from
  `route.paramMap`, validate against the known tab ids (fall back to the default), and
  **navigate** to switch — never set the signal directly.
- **A11y:** `role="tablist"` on the strip, `role="tab"` + `[attr.aria-selected]` on each
  native `<button>`.

```css
.tab-bar { display: flex; gap: var(--space-sm); border-bottom: 1px solid #e2e8f0;
           overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; }
.tab-bar::-webkit-scrollbar { display: none; }
.tab-btn { flex: 0 0 auto; scroll-snap-align: start; min-height: 44px; white-space: nowrap;
           border: none; background: transparent; border-bottom: 2px solid transparent;
           margin-bottom: -1px; }                /* sit the underline over the strip border */
.tab-btn.active { border-bottom-color: #2563eb; }
```

Reference implementation: `system-setup.ts` (`activeTab` signal + `TAB_IDS`, param-driven)
and `system-setup.css` (`.tab-bar`, `.tab-btn`), routed as `system-setup` and
`system-setup/:tab`.

#### Data listings — card-per-record, never a raw `<table>`

For listing records (users, roles, subscribers, etc.) **do not use a plain `<table>`** —
fixed table columns overflow horizontally and don't fit on mobile. Use a **card-per-record
list**: each record is a card with its primary value as a **title** and the remaining
fields as **wrapping label/value pairs** that sit inline on desktop and wrap/stack on
mobile. No horizontal scroll, reads well at every width.

- If a row has an **action** (e.g. Manage / Edit), wrap the content + action in the
  action-row grid above (`minmax(0, 1fr) auto`, actions right on desktop / full-width
  below on mobile). Keep any **expanding panel** (inline edit, sub-list) as a full-width
  sibling **inside** the same card, below the row.
- Use the field **label** (`dt`) as a small uppercase caption and the **value** (`dd`) as
  body-2 text, so the card is self-describing without a column header.

```html
<div class="data-list">
  @for (r of rows(); track r.id) {
    <div class="data-card">
      <div class="data-card__title">{{ r.primary }}</div>
      <dl class="data-card__meta">
        <div class="meta"><dt>Label</dt><dd>{{ r.value }}</dd></div>
        <!-- …more fields… -->
      </dl>
    </div>
  }
</div>
```

```css
.data-list { display: flex; flex-direction: column; gap: var(--space-sm); }
.data-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: var(--space-md); }
.data-card__title { font-weight: var(--weight-semibold); color: #0f172a; word-break: break-word; }
.data-card__meta { display: flex; flex-wrap: wrap; gap: var(--space-xs) var(--space-lg); margin-top: var(--space-sm); }
.data-card__meta .meta { display: flex; align-items: baseline; gap: var(--space-xs); min-width: 0; }
.data-card__meta dt { font-size: var(--font-caption); font-weight: var(--weight-bold); text-transform: uppercase; color: #64748b; }
.data-card__meta dd { font-size: var(--font-body-2); color: #1e293b; word-break: break-word; margin: 0; }
```

Reference implementation: `system-setup.html` / `system-setup.css` (`.data-list`,
`.data-card*`, with the Subscribers card combining `.data-row` actions + an expanding
`.admin-panel`).

#### App bar + mobile drawer layering (z-index & a single header height)

The dashboard shell is a fixed-height **app bar (header)** on top, with a **side nav**
that becomes an off-canvas **drawer** on mobile (toggled by the hamburger), over a
dimmed **backdrop**. Two rules keep them from colliding — both were the cause of a
real bug (the drawer covered the apps switcher / avatar, and dropdowns overlapped the
header):

- **The header must stack ABOVE the drawer and backdrop.** Give the app bar
  `position: relative; z-index: <above the drawer>` (drawer is `z-index: 1000`,
  backdrop `999`, so header is `1100`). Without a `z-index` the header is in normal
  flow and any positioned `z-index` element (the drawer) paints over it — covering the
  apps switcher and avatar. The drawer should slide in **under** the app bar (Material
  "app bar over navigation drawer"), never over it.
- **One source of truth for the header height.** Everything that must sit *below* the
  header — the mobile drawer's `top`, the backdrop's `top`, and header dropdowns'
  `top` (apps/workspace/avatar menus) — must offset by the **same** value. Use a CSS
  var (`--header-height` on the shell host) and reference it everywhere; never
  hard-code the pixel number in more than one place. The original bug was exactly this
  drift: the header grew to 80px but dropdowns were still pinned at `top: 55px`, so
  they overlapped the header.

Reference implementation: `dashboard.css` — `:host { --header-height }`,
`.google-topbar { height: var(--header-height); z-index: 1100 }`, and the mobile
`.sidebar` / `.sidebar-backdrop` / header dropdowns all offset by `var(--header-height)`.

#### Frontend access model (route guards)

Access is enforced in **three layers** — and the backend is the only authoritative one:

1. **UI (discovery):** the sidebar + apps switcher are **menu-driven** — built only from
   the user's granted menus — so users don't *see* systems they can't access.
2. **Route guard (UX/route safety):** stops a user **URL-hopping** into a system/area
   they lack (the UI hiding it isn't enough on its own).
3. **Backend (authoritative):** every data endpoint enforces it server-side —
   `requireModule('<Module>')` (entitlement) + RBAC (role→menu). Frontend guards are
   **never** the real protection; they're for UX. A new data endpoint MUST enforce here.

**Auth gate.** The shell is behind `authGuard`, which requires a token that is present
**and not expired** (it decodes `exp`). HTTP `401`s are also caught by the auth
interceptor, which clears storage and redirects to `/login`.

**Guarding a new system route.** Opt a route into per-system access with route `data`
+ the shared guard — never re-implement the check inline:

```ts
{ path: 'golf', component: GolfComponent,
  canActivate: [systemAccessGuard],
  data: { systemModule: 'Golf Management' } }   // must match the Module name
```

`AccessService.canAccessModule(name)` decides: a user can access a module if it's in
their granted menus, plus `System Setup` for a Tenant/System Admin and
`SaaS Administration` for a System Admin. On denial the guard redirects to
`/access-denied` (`AccessDeniedComponent`, rendered inside the shell, "Back to
dashboard" returns to the user's own system). Routes that everyone may see
(`/home`, `/profile`, `/settings`) carry no `systemModule` and no guard.

Reference: `access.service.ts`, `access.guard.ts`, `access-denied/`, `auth.guard.ts`,
and the `data.systemModule` + `canActivate: [systemAccessGuard]` entries in `main.ts`.

#### Workspace selection & last-accessed memory

A user can belong to **multiple companies** (`CompanyUser` rows; the System
Administration workspace is the `companyId = null` membership, surfaced to the UI as the
`'SYSTEM'` sentinel). Login resolves which workspace to enter:

- **0 memberships →** `403` (no workspace).
- **exactly 1 →** logged straight in (no picker).
- **multiple →** historically a `206` with the club list, shown as the selection page on
  **every** login. That friction is removed by remembering the **last-accessed
  workspace** (the single authoritative source of "where do I land"):
  - The backend stores it on the user — **`User.lastWorkspaceId`** (a `companyId`, or the
    `'SYSTEM'` sentinel; `null` = never chosen). It's written whenever the user enters a
    workspace: email login, Google login, and **switch-workspace**.
  - On a multi-company login with no explicit choice, if `lastWorkspaceId` is **still a
    valid membership**, the backend resolves it and returns `200` (skips the picker). If
    it's unset or was **revoked**, it's no longer in the membership set, so login falls
    through to the `206` picker once and re-remembers whatever they pick. The membership
    re-check is what makes the revoke case "just work" — no separate default to maintain.
- **Why backend, not localStorage:** it survives the `localStorage.clear()` the auth
  interceptor does on `401`, works across devices/browsers, and is validated server-side.

**Frontend.** The login flow already branches on `200` vs `206`, so the happy path needs
no change — resumed users sail through. The dashboard header shows the **active company**:
a **switcher dropdown** when `workspaces().length > 1`, and a **static company label**
(icon + name, no dropdown) for single-company users so they always see which company
they're in. The persistent workspace switcher (`/auth/workspaces` + `/auth/switch-workspace`)
lets multi-company users change company any time; doing so updates the remembered "home".

> Existing multi-company users have `lastWorkspaceId = null` until their **first login
> after this shipped**, so they see the picker once more, then it sticks.

Reference: `auth.controller.js` (`rememberLastWorkspace`, `buildResumeLogin`, login /
google login Scenario B & C, `switchWorkspace`), `user.model.js` (`lastWorkspaceId`),
and `dashboard.html` / `dashboard.ts` (`.workspace-switcher`, `.workspace-label`,
`activeCompanyName`).

