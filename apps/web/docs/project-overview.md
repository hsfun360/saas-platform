# Project Context & Engineering Standards - Frontend Login App

## 🎯 Project Overview
- **Tech Stack:** Angular v21.2.4 (Zoneless, Standalone Components, Signals).
- **Core Functionality:** User authentication UI, registration flow, and JWT token storage.

## 🛠️ Development Workflows
- Start dev server: `ng serve`
- Production build: `ng build --configuration production`
- Run unit tests: `ng test`
- Lint code: `ng lint`

## 📦 Dependencies & npm audit

- After `npm ci`/`npm install`, npm prints a vulnerability count (currently ~17).
  Every advisory is inside the Angular framework or its build tooling (`@angular/*`, `@babel/core`, `ajv`, `picomatch`, `undici`, `vite`), not in code or packages we chose directly.
- Do NOT run `npm audit fix` before starting work.
  With everything pinned to `^21.0.0` and no patched 21.2.x published yet, plain `npm audit fix` is a no-op, and the audit report has no effect on `ng serve`/`ng build`.
- NEVER run `npm audit fix --force`.
  There is no clean patch to land on, so `--force` cross-pins the framework/devkit to a different major or a `-next` release and breaks the build.
- The correct fix is a deliberate framework update through Angular's own tooling, run periodically:
  `npx ng update @angular/core @angular/cli`.
  It only moves to real, compatible releases, so once the Angular team ships a patched 21.2.x the count drops on its own.

## 📐 Coding Guidelines & Architecture
- **State Management:** Use Angular Signals for component state. Use a dedicated `AuthService` (Signals-based) to track login states.
- **Forms:** Use **Reactive Forms** (`FormGroup` / `FormBuilder`) for all data-entry, each field carrying its correct HTML5 input type. See coding-standards.md → "Forms" for the full standard (canonical reference: `platform-users`). Angular Signal Forms is experimental and not approved for production yet.
- **Change Detection:** Strictly Zoneless. No dependency on `zone.js`.
- **Component Design:** Every component must be `standalone: true`.
- **Naming Conventions:** Follow standard Angular style (`*.component.ts`, `*.service.ts`, `*.guard.ts`).

## 🛑 Project Constraints & Anti-Patterns
- **Do NOT:** Implement any hardcoded API fallback keys locally.
- **Do NOT:** Use legacy `NgModules` or inject `ChangeDetectorRef`.
- **Security:** Never store raw passwords or sensitive payload structures in local logs.
- **Type Safety:** Enforce `strictNullChecks`. The `any` type is banned.

## UI/UX Requirements

### Core design principle: no dark rooms - show the expected result

**Never leave the user in the dark about what an action will produce.**
Before an action runs - especially one that creates, copies, applies, or changes data - make the outcome visible so there are no surprises.

- Actions that create/copy/apply/generate multiple things get a **preview + selection**, not a blind "do it all": show the actual items with details, mark ones already present, pre-select the new ones, and let the user choose.
  Reference: Tax Setup "Load defaults" lists the exact schemes (code, name, rates), flags already-added ones, and multi-selects before copying.
- **Buttons state the concrete outcome** ("Load 3 schemes", not "Load"); results report what was created vs skipped.
- Show counts / affected items so the result is unambiguous; prefer previews and confirmations over silent success.

- ALL user interfaces MUST be mobile-responsive
- Use mobile-first design approach
- **Three responsive tiers** (see "Responsive strategy" below): mobile (< 768px),
  tablet (768-1023px), desktop (≥ 1024px). Test every screen at all three - e.g.
  360px, 800px, 1280px.
- Touch targets minimum 44x44px
- Use relative units (rem, %, vh/vw) instead of fixed pixels
- Stack layouts vertically on mobile, horizontal on desktop
- Body/primary text is min 16px on mobile (`--font-body`). Secondary text follows
  the type scale - Body-2 14px, Caption 12px, Overline 10px - and must never carry
  primary reading content. Form inputs are always ≥ 16px (also prevents iOS zoom).
- Form controls (`input`, `select`, `textarea`) are globally `box-sizing: border-box`
  + `max-width: 100%` (in `styles.css`), so their padding sits inside the width and
  they never overflow their column - this holds even for inline-styled inputs (e.g.
  the Companies dialogs), not only the shared `.form-group` classes.
- Add appropriate viewport meta tags
- Test all interactive elements for touch accessibility (interactive targets ≥ 44×44px)

### Responsive strategy (three tiers)

The app targets **three** width tiers. The pixel boundaries (`767 / 768 / 1023 /
1024`) are the ONE source of truth - reuse exactly these in every `@media`; never
invent a new breakpoint. Because CSS media queries can't read custom properties,
the numbers are repeated literally, but always these numbers.

| Tier | Width | Layout | Navigation (shell) | Spacing |
| --- | --- | --- | --- | --- |
| **Mobile** | `< 768px` | single column; full-width controls | off-canvas **drawer** (hamburger / "More") + fixed **bottom nav** | tight (`--space-md`), edge-to-edge |
| **Tablet** | `768-1023px` | 2 columns | **collapsible rail** side nav (72px icons; hover / pin expands to 256px overlay); no bottom nav | comfortable (`--space-lg`) |
| **Desktop** | `≥ 1024px` | multi-column | **persistent** full side nav (256px, labels always shown); pushes content | generous (`--space-xl`) |

- **Shell** (`dashboard.css`): the three tiers live here - `@media (max-width: 767px)`
  (drawer + bottom nav), the base rules (tablet rail), and `@media (min-width: 1024px)`
  (persistent full sidebar + `.content-area` `--space-xl`). Every screen inherits
  this by rendering inside `.content-area`, so screens rarely need their own shell
  media queries.
- **Grids:** 1 col mobile → 2 col tablet → (optionally) 3 col desktop. Use the
  **`.grid-3`** utility (in `styles.css`) for dense listing/card grids that want a
  3rd column on desktop. **Forms stay 2-column** (an inline `minmax(0,1fr)
  minmax(0,1fr)` grid, which the global `@media (max-width:767px)` rule collapses to
  1 column on mobile) - do NOT force a 3rd column on a form.
- **Spacing scales up per tier** - the shell's `.content-area` gutter is `--space-md`
  (mobile) → `--space-lg` (tablet) → `--space-xl` (desktop), so content breathes more
  as the viewport grows without any per-screen work.

### Responsive component patterns
All UI components you generate MUST follow these patterns:
- **Layout:** Single column on mobile, 2 columns on tablet, multi-column on desktop
  (see "Responsive strategy" above for the exact tiers).
- **Navigation (adaptive - one source of destinations, container changes by width):**
  - Primary destinations: a **bottom navigation bar** on mobile, a **collapsible rail**
    side nav on tablet, and a **persistent** side nav on desktop.
  - Secondary destinations: a **hamburger-toggled drawer** on mobile that becomes the
    rail/persistent **side nav** on tablet/desktop.
  - Bottom nav is for navigation **destinations only** - use in-page buttons / a FAB for actions, never put actions in the bottom bar.
- **Buttons:** Use the shared `.btn` system (see "Button system" below). Full-width
  primary CTAs on mobile (auto/content width on desktop); every button keeps a ≥ 44px
  touch target at all widths. Do **not** hand-roll one-off inline button styles.
- **List/card row actions:** Info on the left, action buttons on the right at the same
  level on desktop; on mobile the actions drop to a full-width row below, left-justified
  (see "List/card action-row layout" below).
- **Spacing & font scale:** Use the mobile-first scales below. They are exposed
  as CSS custom properties in `src/styles.css` (`--font-*`, `--space-*`, `--weight-*`) -
  prefer those tokens over hard-coded `px` values.

#### Typography scale (mobile-first)

| Level | Size | Weight | CSS var | Used for |
| --- | --- | --- | --- | --- |
| Display / Hero | 32–40px (2–2.5rem) | Bold/Black | `--font-display` | Login screens, empty states, major headings |
| H1 - Page title | 24–28px (1.5–1.75rem) | Bold | `--font-h1` | Dashboard, Settings, main screens |
| H2 - Section header | 20–22px (1.25–1.375rem) | Semibold | `--font-h2` | Card titles, section headers |
| H3 - Subsection | 18px (1.125rem) | Medium | `--font-h3` | Form labels, list group headers |
| Body - Primary | 16px (1rem) | Regular | `--font-body` | Main content, paragraphs, buttons (**a11y minimum**) |
| Body 2 - Secondary | 14px (0.875rem) | Regular | `--font-body-2` | Descriptions, helper text, captions |
| Caption - Metadata | 12px (0.75rem) | Regular | `--font-caption` | Timestamps, labels, badges |
| Overline - Micro | 10px (0.625rem) | Uppercase/Bold | `--font-overline` | Section markers, status indicators |

#### Spacing scale (8pt grid)

| Token | Size | CSS var | Used for |
| --- | --- | --- | --- |
| xs | 4px (0.25rem) | `--space-xs` | Tiny gaps, icon-to-text spacing |
| sm | 8px (0.5rem) | `--space-sm` | Compact items, list item padding |
| md | 16px (1rem) - **default** | `--space-md` | Standard / card padding, list item spacing |
| lg | 24px (1.5rem) | `--space-lg` | Section spacing, form group separation |
| xl | 32px (2rem) | `--space-xl` | Screen padding, major sections |
| 2xl | 48px (3rem) | `--space-2xl` | Hero sections |
| 3xl | 64px (4rem) | `--space-3xl` | Page top/bottom breathing room |

#### Colour tokens & appearance (3 modes: System / Light / Dark)

The app ships **light and dark themes**, chosen via a **3-mode** control in Settings → Appearance: **System** (follows the OS `prefers-color-scheme`, live), **Light**, or **Dark**.
`ThemeService` (`src/app/services/theme.service.ts`) resolves the mode, persists it, and stamps `data-theme="light|dark"` on `<html>`; a tiny inline script in `index.html` applies it before first paint (no flash), and an `APP_INITIALIZER` re-applies on boot.
Default is **Light** for now — flip the `ThemeService` default to `'system'` once every surface is verified in dark.

**The rule: colour comes from semantic tokens, never hard-coded hex.**
Every colour in CSS or an inline `style=` must reference a `var(--token)` from the set below (defined in `src/styles.css` under `:root` for light and `:root[data-theme="dark"]` for dark).
This is what makes a screen support all three modes automatically - a component built on the tokens themes itself with zero extra work.
A raw `#hex` / `rgb()` in a component is a bug: it won't flip in dark mode.

| Group | Tokens | Use for |
| --- | --- | --- |
| Surface | `--surface-page` `--surface-card` `--surface-sunken` `--surface-input` `--surface-hover` `--surface-selected` | page bg, cards/dialogs/panels, subtle fills/hover, form inputs, selected/active row |
| Sidebar groups | `--nav-group-surface` `--nav-group-head-surface` | an expanded menu group's contained block, and the group header's own shape inside it (each a step darker than the sidebar) |
| Text | `--text-primary` `--text-secondary` `--text-muted` `--text-on-brand` | body, secondary, captions, text on a brand fill |
| Border | `--border` `--border-strong` | default dividers, input/emphasis borders |
| Brand | `--brand` `--brand-hover` `--brand-text` `--brand-disabled` | primary button fill, hover, brand text/links, disabled brand button |
| State | `--danger-*` `--success-*` `--info-*` (each `-text`/`-surface`/`-border`), `--chip-off-surface` `--chip-off-text` | errors, success, info banners; inactive status chip |
| Accent / misc | `--accent` `--focus-ring` `--overlay` `--shadow` `--shadow-sm` | non-primary accent icons, focus ring, modal scrim, shadows |

**Building a NEW screen, component, or option - it MUST work in both themes:**
- Use the tokens for every colour; never hard-code a `#hex`.
- Compose the shared, already-theme-aware building blocks - the `.btn` system, `<app-dialog>`, the listing-card standard (`.data-card` / `.status-chip`), and the form-field standard (`.saas-form` / `.form-group`) - rather than styling from scratch.
- If you genuinely need a colour the palette doesn't have, **add a token** (a light value under `:root` **and** a dark value under `:root[data-theme="dark"]`) and reference it - do not hard-code the colour. Keep both values WCAG-AA against their background.
- The dark header/branded bar and the header dropdowns are intentionally dark in both themes - a small, deliberate exception, not a pattern to copy.
- Verify the screen in **all three modes** (System resolves to your OS) before shipping; a third-party widget in an iframe (e.g. TinyMCE) needs its own dark config, it won't inherit the tokens.

Reference: `styles.css` (token definitions), `theme.service.ts`, and the Settings Appearance control (`dashboard/settings`).

#### Button system (shared component)

There is **one** button component, defined globally in `src/styles.css`. Always use it
instead of inline-styling a `<button>` - this keeps every screen visually consistent,
guarantees the a11y touch target, and means a future restyle is a one-file change.

| Class | Use for |
| --- | --- |
| `.btn` | **Base - always required.** Provides the ≥ 44px touch target, padding, radius, focus styles, disabled state, and icon spacing. |
| `.btn--primary` | The main call to action (Save, Create, Update, Add). |
| `.btn--secondary` | Lower-emphasis / bordered actions (Edit, Cancel). |
| `.btn--danger` | Destructive / **deactivating** actions (Delete, Remove, Revoke, **Disable**). |
| `.btn--success` | Affirmative / **activating** actions (**Enable**, Approve, Activate). |
| `.btn--link` | Looks like an inline text link but keeps the 44px target + a11y. |
| `.btn--sm` | Modifier: denser padding/text for inline row actions (still 44px tall). |
| `.btn--block` | Modifier: full width (primary CTAs, esp. on mobile). |

Rules:
- Compose a base + one colour + optional modifiers, e.g.
  `class="btn btn--secondary btn--sm"` or `class="btn btn--primary btn--block"`.
- Pick the colour by **intent**, not by look: destructive actions are always `.btn--danger`.
- **Enable / Disable toggles read as a colour pair app-wide:** the **Disable** action is always `.btn--danger` (red) and the **Enable** action is always `.btn--success` (green), so status is legible at a glance on every reference-data / listing screen. For a single button whose label flips, bind the colour to state (`[class.btn--danger]="isActive"` / `[class.btn--success]="!isActive"`).
- Icon-in-button: put a `<span class="material-icons" aria-hidden="true">…</span>` inside;
  `.btn` already spaces it. Icon-only buttons still need an `aria-label`.
- `button[type="submit"]` and `.btn--block` go full-width on mobile automatically.
- The auth screens (login / reset / forgot / system-setup) keep their own scoped
  `.btn-primary` (single-dash) for their centred-card layout - don't confuse the two.

#### Icons - one system, no icon libraries

All icons come from the **Material Icons ligature font**, loaded once from Google Fonts in `index.html`.
There is deliberately NO icon component library (no ng-icons, no Lucide, no Angular Material) - the font is already paid for on every page load, adds zero JS to the bundle, and recolours with the theme tokens.
Do not add an icon dependency; pick a name from the Material Icons set instead.

- **Screen headers** use the shared **`.saas-icon`** tile (global in `styles.css`): `<span class="saas-icon material-icons" aria-hidden="true">badge</span>` - a 52px brand-tinted rounded square (`--brand-surface` fill, `--brand-text` glyph, AA in both themes).
  Never use a raw emoji as a screen icon: emoji artwork differs per OS and cannot follow the theme.
- **Buttons and inline icons** use a plain `<span class="material-icons">` (see Icon-in-button above).
- **Sidebar module/menu icons** are Material Icons names stored in the DB (`Menu.icon`).
- Keep one concept = one icon app-wide (e.g. every transaction-type master uses `receipt_long`, both email-template screens use `mail`).

#### Screen header title/subtitle - menu-driven and translated

The screen header's title and subtitle come from the **granted Menu record**, not from a hardcoded string, so the header always matches what the user clicked in the sidebar - in the active language.
Subscribers maintain the per-language texts in Modules & Menus (the Translations block: `Menu.names` / `Menu.descriptions`); toggling the header Language control re-renders titles immediately.

- Wrap the header texts in the shared pipes, passing the hardcoded English as the fallback:
  `<h1>{{ 'Memberships' | screenTitle }}</h1>` and
  `<p class="saas-subtitle">{{ 'Individual and corporate...' | screenSubtitle }}</p>`
  (pipes in `i18n/screen-title.pipe.ts`, resolution in `i18n/screen-title.service.ts`).
- Resolution chain: `menu.names[lang]` -> `menu.name` -> the fallback argument (same for descriptions).
  Screens that aren't menu-backed (the hardcoded SaaS Administration set, samples) just show the fallback.
- Route -> menu matching mirrors `PermissionsService`/`HelpService` (exact, then drop trailing segments), and menus come from the login's localStorage cache - a menu rename shows after the next login, like the sidebar.
- The service also keeps **`document.title`** (the browser tab) in step with the resolved menu name.
- Dynamic subtitles (e.g. Public Holidays' per-country line) and dictionary-translated screens (Account Languages' `| t` keys) stay as they are - don't double-translate.
- New screens MUST use the pipes in their header; every existing listing screen already does.

#### Permission-gated actions (RBAC) - FAB / Edit / Delete buttons

Access is three questions, and the UI reflects two of them per screen (the backend stays the only authoritative gate - see `apps/api/docs/systems/system-administration.md`):

1. **Which screens** a role can open - the menu grants (sidebar + route guards, unchanged).
2. **Which actions** the role has on this screen - per-menu Create / Edit / Delete flags, granted in Role Management and shipped on each login menu as `actions {create, edit, delete}`.
3. **Whose records** the role may amend - the role's data scope (own / department / all), computed server-side per row.

**The standard for every CRUD screen** (reference implementations: the three membership master screens):

- Wrap every action control in the structural **`*appCan`** directive (`shared/can.directive.ts`, backed by `PermissionsService.can()` which resolves the current route against the stored menus):
  - the **New/Create FAB** and any "Copy from…" / "Load defaults" seeding button → `*appCan="'create'"`
  - **Edit** and **Enable/Disable** row buttons → `*appCan="'edit'"`
  - **Delete/Remove** row buttons → `*appCan="'delete'"`
  A user without the action simply does not see the button - never show a control that will 403.
- Where the listing endpoint returns a per-row **`canModify`** flag (data scope), hide the row's Edit/Enable/Disable actions when it is `false`: `@if (row.canModify !== false) { …buttons… }`. Absent flag = allowed (older endpoints).
- Defaults are deliberately permissive: system/tenant admins, menus cached before the flags shipped, and screens not in the menu catalogue all resolve to allowed - gating only engages when a grant explicitly withholds an action.

**Role Management (where grants are made)** presents the same model to the admin: one collapsible card per module (tri-state select-all + "x of y selected"), the real menu tree with grouping menus as non-selectable headings, each selected menu's Create/Edit/Delete toggles (new grants start as full access), a menu search, a Data-scope radio (own / department / all in plain language), and a selection summary before Save.

#### Phone / mobile / fax fields (shared component)

Every phone-type field uses the shared **`<app-phone-input>`** (`src/app/shared/phone-input`) -
a country dialling-code select (flag + code, e.g. `🇲🇾 +60`) beside the number input.
Do **not** hand-roll a `<input type="tel">` for phone/mobile/fax.

- It's a `ControlValueAccessor`, so it binds with `formControlName` (reactive forms - the
  standard) exactly like a native input. It also accepts `[(ngModel)]`, but new screens use
  Reactive Forms (see coding-standards.md → "Forms").
- It reads/writes a **single combined string** - dialling code + national number, e.g.
  `+60123456789` - and splits it back on load by longest-prefix match (default `+60`).
  So the backend/model keeps one `phone` string; no separate country-code column.
- Pass `inputId="…"` matching the field's `<label for>` (keeps the label associated), and
  an optional `placeholder`.
- Country list lives in `src/app/shared/country-codes.ts` (Malaysia first) - add entries
  there, not per-screen.

```html
<label for="uPhone">Phone</label>
<app-phone-input formControlName="phone" inputId="uPhone" placeholder="Optional"></app-phone-input>
<!-- template-driven (legacy only): <app-phone-input name="uPhone" [(ngModel)]="form.phone" inputId="uPhone"></app-phone-input> -->
```

Reference implementations: `platform-users`, `subscribers`, `tenant-users`, `companies`
(edit details), and `profile` - all bind a single `phone` string.

#### List/card action-row layout (adaptive)

The standard for any list/card where a row has **content + actions** (e.g. Companies,
Role Management, User Management). One source of truth; the container reflows by width:

- **Desktop (≥ 768px):** content on the left, action buttons on the right **at the same
  level** as the content.
- **Mobile (≤ 767px):** the actions drop to a **full-width row below the content,
  left-justified**.

Implement it with a CSS-grid class (named areas), **not** inline styles - the global
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
  **ignores `min-width: 0`** during track sizing - `minmax(0, 1fr)` forces the minimum to 0
  so the text wraps. Also avoid `width: 100%` on a button in the main cell (it feeds the
  button's preferred width back into track sizing - let it fill via the default `stretch`).
- Keep expanding panels / edit forms as **full-width siblings below** the grid row, not
  inside it, so they span the whole card.
- Reference implementations: `companies.css` (`.company-*`, with a status badge),
  `role-management.css` (`.role-*`), `tenant-users.css` (`.assign-row*`),
  `modules-menus.css` (`.mm-row*`, with a `<button>` main cell).

**Status chip (active/inactive etc.) is always TOP-RIGHT.** When a record card carries a
status badge, it is **right-justified** in its own grid area, not inline after the title -
this is the app-wide standard so every list reads the same way.
Add a third area to the grid and pin the badge to the end; on mobile the badge **stays
top-right** while the actions drop to a full-width row below:

```css
grid-template-areas:
  "main  badge"
  "main  actions";        /* desktop */
/* mobile: "main badge" / "actions actions" */
.row__badge { grid-area: badge; justify-self: end; align-self: start; white-space: nowrap; }
```

The shared implementation is **`.data-row--with-badge`** (compose as
`class="data-row data-row--with-badge"`, with a `.data-row__badge` cell) in
`system-setup.css`. Reference implementations: `platform-users.html` (Active/Inactive
chip + SSO brand icon next to the email) and `companies.css` (`.company-summary`).

#### In-app help (route-keyed user guides)

Screens link to their end-user manual automatically - there is NO per-screen wiring:

- Manuals are generated by the `/user-manual` skill: source of truth in `docs/user-manual/<system>/<screen>.md`, plus a published copy at `public/help/<route-slug>.md` and an entry in `public/help/index.json` (the manifest; slug = route with `/` -> `-`, e.g. `/admin/countries` -> `admin-countries`).
- `HelpService` (`services/help.service.ts`) loads the manifest once and resolves the current router URL to a slug (dropping trailing segments, so `/x/:id` detail routes fall back to `/x`'s manual).
  The manifest is the existence check because the SPA fallback answers 200 for any unknown path.
- `<app-help-button>` (`shared/help-button/help-button.ts`) sits once in the dashboard header: it shows a Book icon whenever the current route resolves to a manual and opens the guide in a theme-aware slide-over panel (Markdown rendered with the self-hosted `marked`, sanitized by Angular, `[Screenshot: ...]` authoring placeholders hidden).
- Publishing a new manual = writing the two files + manifest entry and running `deploy-web`; the icon appears on that screen automatically.

#### Master–detail screens (sliding pane + URL state)

For any screen with a **list (master) → item detail (detail)** relationship (e.g. Modules
& Menus), use the web equivalent of a `SlidingPaneLayout` + `NavigationStack`:

- **Layout (CSS only):** a grid container with two panes - master + detail **side-by-side
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
- **Return to the row (required):** navigating between the two routes **recreates the
  component**, so on the way back the master re-renders at the top - on mobile the user
  who was editing the last card would have to scroll all the way down again. Wire the shared
  `ScrollReturnService` (`services/scroll-return.service.ts`): tag each master card with
  `[attr.data-return-id]="row.id"`, call `returnScroll.remember(listPath, id)` when the
  detail opens (in the `paramMap` subscription), and `returnScroll.consume(listPath, injector)`
  after the master's list data lands (only when nothing is selected). The service scrolls the
  card back into view and flashes it (`.return-flash`, theme-aware). Works for the in-app
  "← Back" and the browser/phone back button alike.

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
`.mm-back`), routed as `modules-menus` and `modules-menus/:moduleId` - including the
`ScrollReturnService` wiring. `items` is the copyable sample; `tax-schemes` and the two
email-template screens (list + separate edit component) follow the same pattern.

#### Section tabs (responsive strip + URL-driven)

For a screen split into a handful of top-level **sections** (e.g. SaaS Administration:
New Subscriber / Subscribers / Roles / Users / Assign Role), use an **underline tab strip
that scrolls horizontally**, with the active tab in the **URL**.

- **Responsive (CSS):** a single-row flex strip with `overflow-x: auto` + `scroll-snap`,
  hidden scrollbar, and `flex: 0 0 auto` tabs that never shrink - so on a phone you swipe
  and a partially-visible tab at the edge signals there's more. Active tab = a coloured
  `border-bottom` (not a pill). Every tab keeps a ≥ 44px touch target and `white-space:
  nowrap`. **Don't** use a non-wrapping, non-scrolling flex row (it clips on mobile).
- **URL-driven (same rule as master–detail above):** the active tab is a route segment
  (`/section/:tab`), so tabs are deep-linkable and survive a refresh. Read it from
  `route.paramMap`, validate against the known tab ids (fall back to the default), and
  **navigate** to switch - never set the signal directly.
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

#### Data listings - card-per-record, never a raw `<table>`

**Canonical reference: the Companies screen** (`companies.html` / `companies.css`). Every
listing/CRUD screen should match its shape - copy it rather than inventing a variant.

For listing records (users, roles, subscribers, etc.) **do not use a plain `<table>`** -
fixed table columns overflow horizontally and don't fit on mobile. Use a **card-per-record
list**: each record is a card with its primary value as a **title** and the remaining
fields as **wrapping label/value pairs** that sit inline on desktop and wrap/stack on
mobile. No horizontal scroll, reads well at every width.

- **No outer card wrapping the whole list.** The screen is, top to bottom: page header →
  search → the list of **per-record cards** → FAB - all sitting **directly on the page
  background**, exactly like Companies. Do **not** wrap the search + list in one big
  surrounding `.card` (it adds a redundant frame, an extra gutter, and a stray section
  heading). Each *record* is a bordered card; the *page* is not. (The legacy System Setup
  tabs still use a list-in-a-card layout - they're being migrated to this standard as each
  tab is split into its own screen; don't copy that pattern for new screens.)

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

These primitives are defined **globally and theme-aware in `styles.css`** - their colours use
the semantic tokens, so every listing card renders correctly in light **and** dark with no
per-screen work.
Compose the shared classes; do **not** hand-roll `.your-screen-card` CSS (that is exactly what
left the Companies screen unthemed until it was migrated).

- `.data-list` - the list wrapper.
- `.data-card` - each record card (surface + border from tokens).
- `.data-card__title` / `.data-card__subline` (+ `.data-card__reg` for the muted parenthetical) /
  `.data-card__desc` / `.data-card__meta` (`dt`/`dd`) - the content.
- `.data-row` + `.data-row--with-badge` (with `.data-row__main` / `__badge` / `__actions`) -
  the content + status + actions grid.
- `.status-chip` + `.status-chip--on` / `--off` - the compact top-right status pill (green =
  on, grey = off), replacing per-screen badge classes and inline colours.

Reference implementation: **`companies.html`** - the canonical listing, which composes these
shared global classes directly (`.data-list` → `.data-card` → `.data-row--with-badge` →
`.status-chip`). `system-setup.html` is a second example. Copy this for new listings.
(The same primitives still exist scoped inside `system-setup.css` for the admin screens that
import it; that duplicate copy is being removed now that the canonical definition is global.)

**Keep cards compact - roughly three lines of info.** A record card reads best as a
short stack, not a wall of label/value pairs. The standard shape:

1. **Title line** - the primary identifier (`.data-card__title`), with the status chip
   pinned top-right via `.data-row--with-badge` (see the status-chip note above).
2. **Subline** - secondary identity info with **no captions**: short text and/or chips on
   one wrapping row (`.data-card__subline`, with muted `.data-card__reg`-style text for
   the parenthetical bits). E.g. `(REG-12345) ENTERPRISE`. For a single free-text line
   (e.g. a role description) use `.data-card__desc` instead.
3. **Meta line** - the rollup fields that genuinely need a caption (`.data-card__meta`
   with `dt`/`dd`), e.g. counts and dates.

Drop low-value fields rather than captioning them: internal ids, and anything already
implied by the title. Move the one or two identity fields a user scans for (a
registration number, a plan) into the caption-less **subline**, and keep only true
metadata in the captioned meta line. Reference implementation: `subscribers.html`
(`.data-card__title` → `.data-card__subline` `(reg)` + plan chip → `.data-card__meta`
Companies/Created), with the `ACTIVE`/`SUSPENDED` status as the top-right badge.

#### Listing card - the exact visual standard (match the Companies card)

The **Companies card** (`companies.html`) is the canonical listing card; every
listing/master card uses these exact values so screens don't drift.
The shared `.data-card__*` classes implement them - use those, don't hand-roll a card.

- **Headline:** `--font-body` (16px), `--weight-semibold`, colour `#1e293b`.
- **Detail / subline:** `--font-body-2` (14px), colour `#475569` (the muted `.data-card__reg` tone); no captions on the subline.
- **Meta caption** (only for true rollups like counts/dates): label `--font-caption`, `--weight-bold`, UPPERCASE, `#64748b`; value `--font-body-2`, `#1e293b`.
- **Card alignment:** the list adds **no horizontal inset** - cards sit flush to the container gutter (the `.saas-container` / screen wrapper already supplies the page gutter), so every listing reaches the same edge. The shared `.data-list` follows this (no horizontal padding).

**Status chip - the compact overline pill.**
A record's Active / Inactive / Disabled status is a small pill pinned **top-right**, **inline with the title's first line** - the row grid is `align-items: start` so the chip aligns with the headline, never floating above a vertically-centred title, and never inline after the title text.
Use these exact values - NOT the larger shared `.badge` (which is `--font-caption`, radius 20px, and red for inactive):

- `--font-overline` (10px), `--weight-bold`, `text-transform: uppercase`, `letter-spacing: 0.5px`, `border-radius: 12px`, padding `--space-xs --space-sm`.
- On / active: background `#dcfce7`, colour `#166534`. Off / inactive / disabled: background `#f1f5f9`, colour `#64748b` (grey, not red).
- Reference: Companies (`.company-badge`) and Tax Setup (`.tx-status`).

**Master-detail: the record's actions live on the MASTER card, not in the detail.**
For a list → children master-detail (Modules & Menus, Tax Setup), the record's own actions - **Edit**, and for soft-lifecycle records **Enable/Disable** (never a hard **Delete** where posted data may reference the record) - sit on the master card via the action-row-with-badge grid.
The detail pane holds only the children (menus, rate lines).
Don't bury the record's Edit in the detail header.

**Country-scoped records show the country flag as the leading icon.**
Where a record is tied to a country (e.g. tax schemes), render `Country.flagEmoji` as the card icon (like the module icon in Modules & Menus), resolved from the active-countries list; render nothing if unknown.

#### Listing chrome - search on top, "New" as a bottom FAB

For any non-trivial listing (more than a handful of rows), the **add** action and the
**find** action go in fixed places, not a single top toolbar:

- **Search on top (find).** Put a single search/filter field directly above the list -
  the primary way users locate a record once scanning fails. Filter the **already-loaded
  list client-side** (a `computed()` over the data signal) for instant results; don't
  round-trip the server per keystroke. Match across the visible fields (title + the
  meta values). The field is a native `<input type="search">` with an `aria-label`, a
  leading search icon, and a clear (✕) button shown only when there's text. Keep it
  ≥ 44px tall and ≥ 16px font (so iOS doesn't zoom on focus).
- **"New" as a bottom FAB (add).** Do **not** put the create CTA in the top toolbar - on
  a long, scrolled list a top button drifts off-screen. Use a **floating action button**
  pinned `position: fixed` bottom-right that stays reachable at any scroll position. This
  is the one place the bottom is for an **action** (the bottom *nav bar* stays
  destinations-only). Compose the shared `.btn .btn--primary` so it keeps the ≥ 44px
  target, colour and focus ring; round it to a pill and add a soft shadow. Give it an
  `aria-label` and leave it **in DOM order after the list** so keyboard/screen-reader
  users still reach it.
  - **z-index:** the FAB sits above content but **below** the shell drawer (`1000`),
    backdrop (`999`) and header (`1100`) - use `z-index: 900`.
  - **Clear the mobile bottom nav.** The shell shows a fixed bottom nav (height
    `--bottom-nav-height`, defined on the shell `:host`) on mobile (≤ 767px). A FAB at a
    plain `bottom: var(--space-lg)` hides **behind** that bar. Offset it on mobile:
    `bottom: calc(var(--bottom-nav-height, 60px) + var(--space-md))`. Don't hard-code the
    bar's pixel height - reference the var so the two never drift.
  - **Master–detail screens:** place the FAB **inside the master pane**. On mobile the
    detail pane sets the master to `display:none`, which hides the FAB's fixed descendant
    automatically - so no "New" button floats over an edit form. No extra logic needed.
- **Create/edit open as their own surface, never an inline form on the list.** Tapping the
  FAB (or a row's Edit) must take the user to a surface they can't miss - **not** an inline
  form that expands at the top of the list (on a scrolled mobile list it appears off-screen
  and the user thinks nothing happened). Use one of:
  - the shared **`<app-dialog>`** (`src/app/shared/dialog`) - a popup that's full-screen on
    mobile (edge-to-edge, over header + bottom nav) and a centred card on desktop; overlay
    at `z-index: 1200` (above the header). It owns the chrome (title bar, **scrollable
    body**, **fixed one-line footer**) and the a11y (see below), so screens just project
    content. **Don't hand-roll a modal** - reuse this. Reference: `companies.ts` (create +
    edit-modules + edit-details dialogs) and `modules-menus.ts` (module + menu dialogs).
  - or a **routed screen** (`/section/new`) that the mobile sliding-pane covers the list
    with - for master–detail screens this falls out of the existing URL-state pattern.
    Reference: `items.ts` (`/items/new`); for a tabbed screen, jump to the create tab
    (`system-setup.ts`, FAB → `switchTab('create')`).
  - **Footer buttons stay on one line.** Title already names the action ("New company"), so
    the primary button is a plain **"Save"** (not "Create company") next to **"Cancel"**,
    right-aligned. The global mobile rule forces `button[type="submit"]` to full width -
    `<app-dialog>` opts out via `.dlg__footer .btn { width: auto }` (in `styles.css`) so
    they never wrap. The Save button sits in the footer but targets the body `<form>` via
    `form="…"`, so Enter-to-submit still works.
  - **A11y (handled by `<app-dialog>`):** focus moves to the first field on open, is
    **trapped** while open, **Esc** closes, and focus **returns to the trigger** on close.
  - **Unsaved-changes guard (handled by `<app-dialog>`) - never lose a half-entered form.**
    A create/edit dialog must not be abandonable without warning once the user has typed something.
    The shared dialog owns this; each screen only opts in:
    - Bind **`[dirty]="form.dirty"`** (a reactive `FormGroup`; the form stays pristine until the user edits a field), and route the footer **Cancel** through the dialog: `(click)="dlg.requestClose()"` with a `#dlg` template ref - so Cancel passes the same guard as the ✕ and Esc.
    - Optionally set **`discardTitle`** / **`discardMessage`** for wording tailored to new-record vs edit (defaults are generic).
    - **Every** leave path is covered while the form is dirty: **Cancel / ✕ / Esc** and the **browser Back button / mobile back gesture** show a styled in-dialog "Discard changes? / Keep editing" confirmation; a **browser refresh / tab close** fires the native "Leave site?" prompt.
    - **Keep editing** returns the cursor to the exact field the user left off in (not the first field). A **pristine** form and a **successful Save** never prompt.
    - Back is trapped by pushing a same-URL history entry when the dialog opens (the dialog is a signal-toggled modal with no URL of its own), intercepted via `popstate`, and the entry is cleaned up on close - guarded by a history-state marker so a forward navigation can't be yanked backward.
    - Reference: `platform-users` and `companies` (`[dirty]="form.dirty"`, Cancel → `dlg.requestClose()`). This is the app-wide standard - apply it to every create/edit dialog.
- **Two distinct empty states.** Separate "the data is empty" from "the search matched
  nothing":
  - No records at all → invite creation ("No items yet. Use 'New item'…").
  - Records exist but the filter excludes them → `search_off` icon + **No items match
    "{{ query }}"** + a **Clear search** button (a native `<button>`, not just clearing
    the field), so the user has an obvious way back to the full list.

```css
.fab {                              /* compose: class="btn btn--primary fab" */
  position: fixed; right: var(--space-lg); bottom: var(--space-lg);
  z-index: 900;                     /* under drawer(1000)/backdrop(999)/header(1100) */
  border-radius: 28px; box-shadow: 0 4px 14px rgba(0,0,0,0.25);
}
@media (max-width: 767px) {         /* lift clear of the fixed mobile bottom nav */
  .fab { bottom: calc(var(--bottom-nav-height, 60px) + var(--space-md)); }
}
```

```ts
readonly search = signal('');
readonly filtered = computed(() => {
  const q = this.search().trim().toLowerCase();
  const list = this.items();
  return q ? list.filter(i => i.name.toLowerCase().includes(q)) : list;   // + other fields
});
clearSearch() { this.search.set(''); }
```

Reference implementation: `items.ts` / `items.html` / `items.css` (`.it-search*`,
`.it-fab`, `filteredItems` computed, the `search_off` empty state), routed as `items`
and `items/:id`.

#### Content width - ONE cap for every listing screen (1140px)

Every listing/CRUD screen caps its content column at **`max-width: 1140px; margin: 0 auto`** - on the wrapper (`class="screen-pad" style="max-width: 1140px; margin: 0 auto;"`) or baked into the screen's container class (`.saas-container`, `.tenant-container`).
One number, no per-screen taste: cards on User Management must be exactly as wide as cards on Positions or Departments, or the app reads as inconsistent when hopping between screens.
Do NOT invent another cap (800/900/1100/1200px listing wrappers have all been migrated to 1140).
Deliberate exceptions - and the only ones: dedicated single-form/settings screens where long text lines hurt readability (Profile 600, Settings 650, Club Specification 760), the auth screens' centred cards, and the member/agent portals (their own surface).

#### Field focus highlight - ON the field, never a floating ring

When a form field (input / select / textarea) receives focus, the highlight sits **on the field itself**: the border turns `--brand` and a soft `--focus-glow` halo hugs that border.
The offset `:focus-visible` outline (2px ring floating 2px OUTSIDE the border) is for **buttons, links, cards and upload tiles only** - on a field it reads as a misaligned box and is the inconsistency this standard kills.
This is enforced by ONE global element-level rule in `styles.css` (`input:not([type='checkbox']):not([type='radio']):focus, select:focus, textarea:focus`), which covers every field wherever it lives - `.form-group` fields, search boxes, dialog rows, inline-styled inputs.
Do NOT write a per-screen `:focus` rule for fields: no per-screen copies of border/glow (they drift - three different blues were found when this was unified), and never a raw rgba glow colour - the tokens are `--focus-glow` (field halo) and `--focus-ring` (offset ring for non-fields).
A screen may add only screen-specific *extras* on focus (e.g. golf hole-grid rows set a background), with a comment pointing at the global rule.

#### Screen wrapper padding - no double gutter on mobile

The shell's `.content-area` already adds a ~16px gutter on mobile (`var(--space-md)`),
so a screen's own top-level wrapper must **not** add a second horizontal gutter on top -
that's the wasted empty space down both sides. On mobile, drop the wrapper's horizontal
padding to **0** and let content (cards, lists) run edge-to-edge inside the shell gutter
(mobile-Gmail style); keep vertical padding for breathing room. Desktop keeps the
comfortable `var(--space-lg)` padding and the centred `max-width` column.

Use the shared **`.screen-pad`** utility (in `styles.css`) on the wrapper, and keep
`max-width` / `margin: 0 auto` inline for the desktop column:

```html
<section class="screen-pad" style="max-width: 900px; margin: 0 auto;"> … </section>
```
```css
.screen-pad { padding: var(--space-lg); }
@media (max-width: 767px) { .screen-pad { padding: var(--space-md) 0; } }
```

Screens with a bespoke container class (`.saas-container`, `.tenant-container`) bake the
same `@media (max-width: 767px) { padding: var(--space-md) 0 }` into that class instead.
Don't re-add horizontal padding on the wrapper for mobile - card/list internal padding
already keeps text off the edge.

#### App bar + mobile drawer layering (z-index & a single header height)

The dashboard shell is a fixed-height **app bar (header)** on top, with a **side nav**
that becomes an off-canvas **drawer** on mobile (toggled by the hamburger), over a
dimmed **backdrop**. Two rules keep them from colliding - both were the cause of a
real bug (the drawer covered the apps switcher / avatar, and dropdowns overlapped the
header):

- **The header must stack ABOVE the drawer and backdrop.** Give the app bar
  `position: relative; z-index: <above the drawer>` (drawer is `z-index: 1000`,
  backdrop `999`, so header is `1100`). Without a `z-index` the header is in normal
  flow and any positioned `z-index` element (the drawer) paints over it - covering the
  apps switcher and avatar. The drawer should slide in **under** the app bar (Material
  "app bar over navigation drawer"), never over it.
- **One source of truth for the header height.** Everything that must sit *below* the
  header - the mobile drawer's `top`, the backdrop's `top`, and header dropdowns'
  `top` (apps/workspace/avatar menus) - must offset by the **same** value. Use a CSS
  var (`--header-height` on the shell host) and reference it everywhere; never
  hard-code the pixel number in more than one place. The original bug was exactly this
  drift: the header grew to 80px but dropdowns were still pinned at `top: 55px`, so
  they overlapped the header.

Reference implementation: `dashboard.css` - `:host { --header-height }`,
`.google-topbar { height: var(--header-height); z-index: 1100 }`, and the mobile
`.sidebar` / `.sidebar-backdrop` / header dropdowns all offset by `var(--header-height)`.

#### Frontend access model (route guards)

Access is enforced in **three layers** - and the backend is the only authoritative one:

1. **UI (discovery):** the sidebar + apps switcher are **menu-driven** - built only from
   the user's granted menus - so users don't *see* systems they can't access.
2. **Route guard (UX/route safety):** stops a user **URL-hopping** into a system/area
   they lack (the UI hiding it isn't enough on its own).
3. **Backend (authoritative):** every data endpoint enforces it server-side -
   `requireModule('<Module>')` (entitlement) + RBAC (role→menu). Frontend guards are
   **never** the real protection; they're for UX. A new data endpoint MUST enforce here.

**Auth gate.** The shell is behind `authGuard`, which requires a token that is present
**and not expired** (it decodes `exp`). HTTP `401`s are also caught by the auth
interceptor, which clears storage and redirects to `/login`.

**Guarding a new system route.** Opt a route into per-system access with route `data`
+ the shared guard - never re-implement the check inline:

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
  - The backend stores it on the user - **`User.lastWorkspaceId`** (a `companyId`, or the
    `'SYSTEM'` sentinel; `null` = never chosen). It's written whenever the user enters a
    workspace: email login, Google login, and **switch-workspace**.
  - On a multi-company login with no explicit choice, if `lastWorkspaceId` is **still a
    valid membership**, the backend resolves it and returns `200` (skips the picker). If
    it's unset or was **revoked**, it's no longer in the membership set, so login falls
    through to the `206` picker once and re-remembers whatever they pick. The membership
    re-check is what makes the revoke case "just work" - no separate default to maintain.
- **Why backend, not localStorage:** it survives the `localStorage.clear()` the auth
  interceptor does on `401`, works across devices/browsers, and is validated server-side.

**Frontend.** The login flow already branches on `200` vs `206`, so the happy path needs
no change - resumed users sail through. The dashboard header shows the **active company**:
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

