# Transaction Type

> **Where:** Golf Management → Common Setup → Transaction Type
>
> **Who can use it:** users whose role includes the Golf Management module.

## What this option is for

The Transaction Type screen is the club's catalog of golf billing items - everything a golfer can be charged at the Tee Time Sheet: green fees, buggy and caddy fees, no-show charges, miscellaneous items and packages.
Each item carries its charge type, the tax scheme applied when it is billed, and its own effective-dated prices (Default Price).
Items marked as the default for a golfer type drive automatic behaviour: the green fee auto-charged at registration, or the one buggy / caddy tile a member or a visitor sees on their bill.
Packages bundle other items with a fixed selling price and, optionally, eligibility conditions (days, times, age, gender, nationality) so only the golfers who qualify can be billed them.
Staff come here when the club introduces a charge, changes a price (a future effective date pre-sets the change), or sets up a promotion package.

## The screen at a glance

[Screenshot: Transaction Type list]

- A count line shows how many transaction types exist and how many are active.
- A search box filters the list as you type; it matches the code, the description and the charge-type label.
- Each item is a card: the code as the title; chips for the charge type, "Default for ..." (when the item is a golfer-type default) and "Manual price allowed"; the description; and, where set, the tax scheme, a package's eligibility summary, elements and auto charge.
- A status chip shows **Active** or **Disabled**; a disabled item stays on this screen but disappears from the billing tiles and from package pickers.
- Each card has **Edit** and a ⋮ menu with **Default Price** (view or maintain the prices) and **Enable** / **Disable**.
- The **New transaction type** button sits at the bottom right.

## Common tasks

### Add a billing item

[Screenshot: New transaction type dialog]

1. Click **New transaction type**.
2. Enter the **Transaction Type** code (e.g. `GF18`, `BUGGY-M`) and pick the **Charge Type**:
   - **Green Fee**, **Caddy Fee**, **Buggy Fee** - priced by a four-cell table (9 / 18 holes × weekday / weekend & public holiday).
   - **No Show Charges**, **Miscellaneous** - a single flat amount.
   - **Package** - a bundle of other items (see below).
3. For a green fee, buggy fee or caddy fee, optionally set **Default for golfer type** (see "Golfer-type defaults" below).
4. Enter a **Description** and pick the **Tax Scheme** applied when the item is billed; leave it as None for a tax-free item.
5. Tick **Allow manual price change at billing** only if the cashier may amend the pre-set price on a bill.
6. Optionally **Upload icon** - the picture shown on the billing tiles.
7. Click **Save**, then open **Default Price** from the card's ⋮ menu to set its prices - an item with no price in force cannot be billed (unless manual pricing is allowed).

### Golfer-type defaults (green fee, buggy fee, caddy fee)

**Default for golfer type** names the category of golfer an item is *the* item for: **Member**, **Member as Guest** or **Guest / Visitor**.
At most one active item per charge type may be the default for a category.

- On a **green fee** it is the fee auto-charged at registration for that category.
  Members *with* golfing right are never auto-charged; Member prices members *without* the right.
  Leave it as None for manual green fees such as group-booking or tournament rates.
- On a **buggy fee** or **caddy fee** it makes the item the only buggy / caddy tile that category sees on the bill - so a member rate (e.g. `BUGGY-M`) and a visitor rate (`BUGGY-V`) resolve by the player being billed, never by the cashier's judgement.
  An item with no golfer type is a tile every golfer may be billed.

### Set or change the prices (Default Price)

[Screenshot: Default Price dialog]

1. Open the card's ⋮ menu and click **Default Price**.
2. The dialog lists the item's price cards, newest first, each tagged **In force**, **Scheduled** (future date), **Superseded** or **Disabled**.
3. Click **New price**, pick the **Effective Date** (a future date pre-sets a price change) and enter the amounts:
   - matrix items: **Weekday** 9 holes / 18 holes and **Weekend & public holiday** 9 holes / 18 holes - **Copy weekday prices** fills the weekend cells from the weekday ones;
   - flat items and packages: the single **Amount**.
4. Click **Save**.

On a play date the system uses the active price card with the latest effective date on or before that date; weekend prices also apply on public holidays; amounts exclude tax.
A scheduled card can be edited, disabled or deleted; a card already in force is history - disable it instead of deleting.

### Set up a package

[Screenshot: Package elements and eligibility on the dialog]

1. Create a transaction type with Charge Type **Package** (the package's own selling price is set afterwards under Default Price).
2. Pick the **Auto Transaction Type** - the item that receives the automatic balance line when the package is billed (package price minus the elements total).
3. Under **Package Elements**, click **Add element** for each bundled item: the **Element**, its **Qty** and the **Unit amount** - the share of the package price allocated to that line.
   The **Elements total** shows against the package price; it is a breakdown, not a constraint.
4. Under **Eligibility**, optionally click **Add condition** to restrict who may be billed the package (see the next task); no conditions = everyone, any time.
5. Pick the package's **Tax Scheme** - it applies to every bill line the package generates.
6. Click **Save**.

When billed, a package explodes into its element lines plus the balance line; the lines are removed together.

### Restrict who may be billed a package (eligibility)

Each condition is one way to qualify - a golfer must meet every part of ONE condition, and a package with several conditions accepts a golfer who matches any of them.
Example: "Sat AM/PM & Sun AM" is two conditions - Saturday (any time) and Sunday 07:05-14:09.

1. Click **Add condition**.
2. Tick the **days of the week** the package applies on (none ticked = any day) and **Not on public holidays** if it is excluded on holidays.
3. Optionally set a **Tee-off from / to** window, the **Holes** (9 or 18), an **Age from / to**, the **Gender** and the **Nationality** (e.g. the club's own nationality for "local golfers only").
4. Read the summary line under the condition (e.g. "Mon/Tue/Wed/Thu/Fri · not on holidays · 07:05-09:05 · age 55+ · Malaysian only") and click **Save**.

On the Tee Time Sheet bill, a package the golfer does not qualify for stays visible but greyed out with the reason ("Age 18 and under", "Tee-off 07:05-09:05 only", "Needs the golfer's date of birth on record").
Age, gender and nationality come from the golfer's record - a member's profile or a visitor's golfer profile - so keep those filled in for golfers who use such packages.

### Edit a transaction type

1. Find the item (use the search box if the list is long) and click **Edit**.
2. Change what you need - a plain item can become a package and back, but an item that is already an element of other packages cannot become a package.
3. Click **Save**.

If you leave without saving, the system asks whether to discard your changes or keep editing.

### Disable / enable a transaction type

- Open the ⋮ menu and click **Disable** to retire an item you no longer bill; it disappears from the billing tiles and package pickers, and its bill history is kept.
- Click **Enable** to bring it back - a golfer-type default can only be re-enabled while no other active item holds that default.

## Worked examples

### Caddy or buggy rates that differ by golfer type

A club charges caddies at 64.00 (9 holes) / 128.00 (18 holes) for members and members' guests, and 69.10 / 138.25 for visitors.

1. Create `CADDY-M` - Charge Type **Caddy Fee**, Default for golfer type **Member**, Tax Scheme SST; under Default Price enter 64.00 / 128.00 in the weekday cells and **Copy weekday prices** to the weekend cells.
2. Create `CADDY-MG` the same way with Default for golfer type **Member as Guest**.
3. Create `CADDY-V` with Default for golfer type **Guest / Visitor** and 69.10 / 138.25.

On a bill, a member sees only `CADDY-M`, a member's guest only `CADDY-MG`, a visitor only `CADDY-V` - the price follows the player, and a tile of the wrong category is refused if someone tries it another way.
Buggy rates (e.g. 75.60 / 129.60 for members, 91.80 / 167.40 for visitors) are keyed exactly the same way with Charge Type **Buggy Fee**.

### A flat extra such as golf insurance

1. Create `INSURANCE` - Charge Type **Miscellaneous**, no golfer type, Tax Scheme None if the premium carries no tax.
2. Under Default Price enter the single **Amount**, e.g. 6.48.

The tile is offered to every golfer; add it to a bill with one click, or include it as an element of a package.

### A package quoted "nett, including tax"

Clubs often publish a package price that already includes tax, e.g. a corporate tournament at 432.00 nett including 8% SST.
Prices in this catalog are **tax-exclusive**, so key the amount before tax and let the tax scheme add it back: 432.00 ÷ 1.08 = 400.00 with Tax Scheme SST 8% bills as exactly 432.00 (756.00 → 700.00, 540.00 → 500.00).

1. Create `TOURN-WD` - Charge Type **Package**, Tax Scheme SST, Auto Transaction Type the visitor green fee.
2. Add the elements the package bundles, with their share of the price - e.g. a half share of a buggy, a caddy and the insurance item; the remainder posts to the green fee automatically.
3. Add an eligibility condition for when it applies - e.g. Mon-Fri; a weekend-morning variant gets Sat and Sun with a tee-off window up to 11:59, a Sunday-afternoon variant gets Sun from 12:00.
4. Under Default Price enter the tax-exclusive **Amount** (400.00).

Items that are not billable lines (e.g. a food-and-beverage share) are not modelled as elements - they stay inside the balance line.

## Field reference

### New / Edit transaction type dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Transaction Type** | Yes | The item's code shown on bills and tiles, e.g. `GF18`, `BUGGY-M`, `PKG-JR`. | Up to 50 characters; unique within the club. |
| **Charge Type** | Yes | Green Fee, Caddy Fee, Buggy Fee, No Show Charges, Miscellaneous or Package. | Decides whether the price is a four-cell table or a flat amount. |
| **Default for golfer type** | No | Member, Member as Guest or Guest / Visitor - the category this item is the default for. | Green, buggy and caddy fees only; one active default per charge type and category. |
| **Description** | No | What the item is, e.g. `18 Holes Green Fee`. | Up to 255 characters. |
| **Tax Scheme** | No | The tax applied when the item is billed; None = tax-free. | Must be one of the club's usable output-tax schemes. On a package it applies to every generated line. |
| **Auto Transaction Type** | Packages: Yes | The item that receives the package's balance line. | An active, non-package item of this club; not the package itself. |
| **Package Elements - Element / Qty / Unit amount** | Packages: Yes | Each bundled item, how many, and the per-unit share of the package price. | At least one and at most 50 elements; an element appears once (use Qty for more); quantity 1-99; amounts 0.00 or more; packages cannot contain packages or disabled items. |
| **Eligibility - days / Not on public holidays / Tee-off from-to / Holes / Age from-to / Gender / Nationality** | No | One way to qualify per condition. | Up to 20 conditions; times both or neither with From before To; ages 0-120 with From not above To; an empty condition is refused. |
| **Allow manual price change at billing** | No | Tick to let the cashier amend the resolved price on a bill (the line is marked "amended"). | Off = the Default Price is binding. |
| **Icon** | No | A square picture for the billing tile. | Image file up to 2 MB; Replace or Remove later. |

### Default Price - New / Edit price

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Effective Date** | Yes | The date this price card comes into force. | One card per date per item. |
| **Weekday 9 holes / 18 holes** | Matrix items: Yes | The prices on the club's weekdays. | 0.00 or more; two decimals. |
| **Weekend & public holiday 9 holes / 18 holes** | Matrix items: Yes | The prices on weekend days and public holidays. | 0.00 or more; **Copy weekday prices** fills them. |
| **Amount** | Flat items and packages: Yes | The single price. | 0.00 or more. |

## Tips & troubleshooting

- If you see "Transaction type 'X' already exists", the code is taken - edit that item instead or pick another code.
- If you see "'BUGGY-M' is already the default buggy fee for Member - disable it first or clear the golfer-type default", only one active item per category may hold the default.
- If you see "A package needs at least one element", "A package cannot list the same element twice - use the quantity instead", "'X' is itself a package - packages cannot be nested" or "'X' is disabled and cannot be added to a package", fix the element rows.
- If you see "Select the Auto Transaction Type", "The Auto Transaction Type cannot be a package" or "The Auto Transaction Type cannot be the package itself", pick a plain active item.
- If you see "This transaction type is an element of existing packages and cannot become a package itself", remove it from those packages first.
- If you see "Eligibility condition 1 sets no condition - remove it, or set at least one", or a message about times, ages or holes, correct that condition row.
- If you see "A price effective 2026-01-01 already exists", edit that card instead of adding a second one for the same date.
- If you see "This price is already in force - disable it instead of deleting", the card has been used - disable it to keep history intact.
- A bill tile shows "'X' has no price in force for <date> - set up its pricing first" when the item has no active price card on or before the play date.
- Name codes consistently (`GF-`, `BUGGY-`, `CADDY-`, `PKG-`, `TOURN-` prefixes) - the tiles show the code, and the search matches it.
- A published "nett" price includes tax: divide it by (1 + the tax rate) before keying it, as in the worked example above.

## Related options

- Golf Management → Front Desk → Tee Time Sheet - where these items are billed (green fee auto-charge, tiles, packages, eligibility reasons).
- Golf Management → Common Setup → Golf Specification - the Cancellation & No-show rule picks a No Show Charges item from this catalog.
- Golf Management → Common Setup → Payment Type - the tenders a bill is settled with.
- System Setup → Tax Setup - the tax schemes offered here.
- System Setup → Companies → Weekend days, and Public Holidays - decide which dates take the weekend price.
- SaaS Administration → Nationalities - the nationality list used by package eligibility.
