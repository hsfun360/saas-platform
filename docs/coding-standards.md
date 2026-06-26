You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Always set `standalone: true` explicitly inside Angular component decorators.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Per-component checklist (apply to every component)

- **Keyboard:** every interactive control is a native `<button>` or `<a routerLink>` — never a clickable `<div>`/`<li>`/`<span>`. It must be reachable with Tab and operable with Enter/Space, with no keyboard trap.
- **Accessible name:** icon-only controls have an `aria-label` (not just `title`). Images use a meaningful `alt`, or `alt=""` when decorative.
- **Colour contrast:** text ≥ 4.5:1 against its background (≥ 3:1 for text ≥ 24px, or bold ≥ ~18.7px). Do not use grey lighter than `#767676` for text on white (e.g. `#94a3b8`/`#9aa0a6` fail).
- **Focus management:** dialogs, menus, dropdowns and the mobile drawer move focus in on open, keep focus within while open, return focus to the trigger on close, and close on `Esc`. Keep a visible focus indicator — never `outline: none` without a replacement.
- **Forms:** every input has an associated `<label for>`; validation errors are announced via `role="alert"` / `aria-live` and linked with `aria-describedby`.
- **Semantics:** use landmarks (`<header> <nav> <main> <aside>`) and a logical heading order (one `<h1>` per page, no skipped levels).
- **Targets:** interactive targets are ≥ 44×44px.

### Running the audit

- `npm run build`, then in one terminal `npm run a11y:serve` and in another `npm run a11y` (pa11y-ci → WCAG2AA via axe + HTML_CodeSniffer; config in `.pa11yci.json`).
- Automated tools catch only ~30–40% of issues (mostly contrast, names, roles). **Authenticated screens** (the dashboard) and **keyboard/focus behaviour** also require a manual pass: Tab through every screen, and verify with a screen reader. To audit logged-in routes, add a pa11y `actions` login step (or inject a JWT) and append those URLs to `.pa11yci.json`.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.
- Do not write arrow functions in templates (they are not supported).

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection
