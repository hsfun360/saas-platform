---
name: user-manual
description: >-
  Produce the end-user manual for a screen (option/menu) of the SaaS platform - what the
  option is for, how to use it, and a field-by-field reference. Use this whenever the user
  asks for a user manual, user guide, help page, screen documentation, field explanations,
  or "document this option/menu" for any screen (Countries, Currencies, Companies,
  Membership Fee/Type/Status, Tax Setup, Modules & Menus, golf master files, etc.),
  including requests to document several or all menus at once. Also use it when a new
  screen has just been built and the user wants its manual written.
---

# User Manual Generator

Write the official end-user manual for one or more screens of this platform.
The reader is club/office staff using the web app - NOT a developer.
Every fact in the manual must be grounded in the actual code; never invent fields, buttons, or behavior.

## Where things live (research before writing)

For each screen ("option/menu") being documented, read these sources in order:

1. **Route + access**: `apps/web/src/main.ts` - find the route, its component, and `data.systemModule` (that module name tells you which system the option belongs to and who can access it).
2. **The screen itself**: the component folder `apps/web/src/app/<screen>/` - the `.html` for layout, dialogs, buttons, badges and empty states; the `.ts` for the reactive form (controls + validators), signals, and action handlers.
3. **Server rules**: the matching module in `apps/api/src/modules/<module>/` - the model (DB constraints, uniqueness, defaults) and controller (validation messages, side effects like "cannot delete when referenced").
4. **Business context**: `apps/api/docs/systems/<system>.md` - why the feature exists, business rules, and vocabulary. Use the business language from these docs in the manual.
5. **Menu location**: menus are DB-driven (Module + Menu tables), so state the menu path generically as `<System> → <Menu label>` using the system doc / route data; do not guess deep menu nesting.

If the user names a menu label rather than a code name (e.g. "Membership Fee"), grep `main.ts` and the component folders to find the screen.

## Grounding rules (what makes the manual trustworthy)

- **Fields come from the form definition.** A field is Required exactly when the control has `Validators.required` (or the label shows `*`). Min/max/maxlength/email/date rules translate into plain-language "Rules" for that field.
- **Input behavior comes from the input type and directives.** e.g. `appMoney` fields: "amounts always display with two decimals (0.00)"; `<app-phone-input>`: "pick the country code, then type the number"; `type="date"`: "pick from the calendar".
- **Buttons and flows come from the template.** Describe only actions that exist: Save/Cancel, Edit, Enable/Disable (green = enable, red = disable, app-wide), Load defaults, Sync now, Generate schedule, search boxes, the "New ..." button.
- **Server messages are the troubleshooting section.** Error strings in the controller ("already exists", "must total the fee amount") become "If you see ..." entries.
- **Platform-wide behaviors** worth one line each where relevant: unsaved-changes confirmation when leaving an edited form; Active/Disabled status chips; disabled records stay in history but disappear from pickers; the list search filters as you type.

## Writing the manual

Follow the exact template in [references/manual-template.md](references/manual-template.md) - read it before writing.

Voice and style:

- Address the reader as "you"; call the software "the system". Plain business English.
- Never use developer vocabulary: no component, API, endpoint, payload, signal, boolean, null, FK. Say "code" only for business codes the user types (e.g. Membership fee code).
- Screenshot placeholders, not images: `[Screenshot: <what to capture>]` at the top of the screen tour and inside any task that opens a dialog.
- Follow the repo Markdown conventions (`docs/working-conventions.md`): each sentence on its own line, plain hyphens only (no em dash).
- Explain WHY a field matters, not just what it is. "Tax scheme - the tax applied when this fee is billed; leave as None for a tax-free fee" beats "select the tax scheme".

## Output

Every manual is written twice - the git source of truth, and the in-app copy that lights up the header's Book icon:

1. **Source of truth**: `docs/user-manual/<system-slug>/<screen-slug>.md` (e.g. `docs/user-manual/membership-management/membership-fee.md`).
   System slugs follow the systems catalog: `saas-administration`, `system-setup`, `membership-management`, `golf-management`, `facility-management`.
   Maintain `docs/user-manual/README.md` as the index: one line per manual, grouped by system. Create it on first use; add new manuals every time.
2. **In-app guide (this is how the option links to its manual)**: copy the same content to `apps/web/public/help/<route-slug>.md` and add the slug to `apps/web/public/help/index.json` as `"<route-slug>": { "title": "<Screen name>" }`.
   The route slug is the screen's route with slashes turned into hyphens: `/admin/countries` -> `admin-countries`, `/membership/fees` -> `membership-fees`.
   The shared `<app-help-button>` in the dashboard header (backed by `HelpService`) watches the current route against that manifest - once the slug is listed, the Book icon appears on that screen automatically and opens the guide in a slide-over panel. No per-screen wiring, no DB change.
   Keep `[Screenshot: ...]` placeholders in both copies; the in-app viewer hides them from staff automatically.
3. The in-app guide goes live with the next `deploy-web` (it is a static asset baked into the image) - remind the user of that; do not deploy unless they ask.
- When asked for "all menus" or a whole system, enumerate the routes of that system from `main.ts`, then write one manual per screen (skip pure dashboard/landing screens unless asked).
- Do not commit unless the user asks; writing the files is the deliverable.

## Quality bar before finishing

Re-read the generated manual and check:

- Every field of every dialog/form on the screen appears in the Field reference (compare against the form group - nothing missing, nothing invented).
- Every button visible in the template is covered under Common tasks or Buttons & actions.
- A brand-new staff member could complete the screen's main job using only Common tasks.
- No developer jargon leaked in.
