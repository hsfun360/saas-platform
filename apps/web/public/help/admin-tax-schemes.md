# Tax Setup

> **Where:** System Setup → Tax Setup
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New scheme, Load defaults, Edit, Enable/Disable and Delete controls only appear when the role also has the matching Create, Edit and Delete permissions on this screen.

## What this option is for

Tax Setup is your organization's catalogue of tax schemes - the taxes your clubs charge or pay, such as Malaysian SST on sales or Singapore GST on purchases.
A scheme is defined per country, has a price treatment (is the tax already inside the price, or added on top?) and a class (output tax collected on sales, or input tax paid on purchases), and carries one or more rate lines.
Rate lines are dated: a rate change is entered as a new line with a later effective date, so documents already posted keep the rate that applied on their date.
A scheme can also stack several components at once (for example a service charge and then a tax on top), ordered by priority.
The schemes defined here are shared by Membership, Golf, Facility and billing, and each company consumes the schemes for its own country (with optional per-company adjustments on the Company Tax screen).
Staff come here when setting up tax for a new country, when a government changes a rate, or when a scheme should no longer be used.

## The screen at a glance

[Screenshot: Tax Setup list with a scheme open]

The screen has two panes: the scheme list on the left and the open scheme's details on the right (on a phone they show one at a time, with a **Back to schemes** button).

- A count line shows how many schemes exist and how many are active, next to a **Load defaults** button.
- When your schemes span several countries, a **Country** picker filters the list; a search box filters as you type and matches the code, name, description and country name.
- Each scheme is a card showing the country flag, the code and name, and the price treatment and class underneath; a small service-bell icon marks schemes that include a Service Charge line.
- A status chip at the top right of each card shows **Active** or **Disabled**; active schemes are listed first, by country and code.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Enable** or **Disable**.
- Clicking a card opens it in the right-hand pane; the open card is highlighted.
- The **New scheme** button sits at the bottom right of the list.

The open scheme's pane shows its country, price treatment, class and description, then its **Rate lines**: each line shows the tax code, rate, type, priority, claimable status, GL account, effective date and whether it is inactive, with an **Edit** button and a **⋮** menu holding **Delete**.
An **Add rate** button sits above the lines.

## Common tasks

### Load the platform's starter schemes (Load defaults)

[Screenshot: Load platform defaults dialog]

The platform publishes starter schemes for each country.
Loading copies them into your own catalogue, including their full rate history; from then on they are yours to maintain.

1. Click **Load defaults**.
2. The dialog lists every starter scheme available for the countries your companies operate in, with its flag, code, name, treatment, class and current rates.
   Schemes you already have are marked **Already added** and cannot be selected; the rest are pre-ticked.
3. Use the search box to narrow the list and untick anything you do not want.
   The line above the list states how many are selected.
4. Click **Load N schemes** - the button states exactly how many will be copied.

The system reports what was created and what was skipped; if everything came from one country, the list is filtered to that country.
Loading again later is safe: schemes you already have are never overwritten.

### Add a scheme of your own

[Screenshot: New tax scheme dialog]

1. Click **New scheme**.
2. Pick the **Country** (hidden and filled in for you when all your companies are in one country).
3. Enter the **Scheme code** and **Name**, choose the **Price treatment** and **Tax class**, and optionally a **Description**.
4. Click **Save**.

The new scheme opens on the right so you can add its rate lines straight away.

### Add a rate line

[Screenshot: Add rate line dialog]

1. Open the scheme and click **Add rate**.
2. Enter the **Tax code** and the **Rate (%)**.
3. Choose the **Tax type** (Tax or Service Charge) and the **Priority**.
4. Set **Effective from** - the first date this rate applies.
5. For an input-tax scheme, tick **Claimable** if the tax can be recovered and enter the **Claim percentage**.
6. Optionally enter the **GL account** the component posts to.
7. Click **Save**.

### Record a rate change

Do not edit the existing line.
Click **Add rate**, enter the same **Tax code** with the new **Rate (%)** and the date the change takes effect as **Effective from**, and save.
From that date the new line applies; earlier documents keep the old rate.

### Correct a rate line

Use **Edit** on a line only to fix a mistake (a typo in the rate, the wrong GL account).
When editing, a **Status** tick box lets you mark the line inactive instead of deleting it.

### Delete a rate line

Open the line's **⋮** menu and click **Delete**.
Prefer marking a line inactive, or adding a newer line, when the rate may already have been used.

### Edit a scheme

1. Click **Edit** on the scheme's card.
2. Change the code, name, treatment, class or description; the country is fixed once the scheme exists.
3. Click **Save**.

If you leave a dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a scheme

- Open the card's **⋮** menu and click **Disable** to retire a scheme you no longer use; it stops being offered when charges are taxed, but posted documents keep their tax.
- Open the **⋮** menu of a disabled scheme and click **Enable** to bring it back.

## Field reference

### New tax scheme / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Country** | Yes | The country whose tax this is. | Only the countries your companies operate in are offered; filled in automatically for a single-country organization; cannot be changed after creation. |
| **Scheme code** | Yes | A short code, e.g. `SST-OUT`. | Up to 50 characters; unique per country within your organization. |
| **Name** | Yes | The scheme name, e.g. `Sales & Service Tax (Output)`. | Up to 150 characters. |
| **Price treatment** | Yes | **EXCLUSIVE** when the tax is added on top of the price; **INCLUSIVE** when the price already contains it. | Defaults to EXCLUSIVE. |
| **Tax class** | Yes | **OUTPUT** for tax collected on sales (billing); **INPUT** for tax paid on purchases, which may be claimable. | Defaults to OUTPUT. Claimable settings only appear for INPUT schemes. |
| **Description** | No | An optional summary. | Up to 255 characters. |

### Add rate line / Edit rate dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Tax code** | Yes | The component code, e.g. `SR`. | Up to 50 characters; one line per code and effective date. |
| **Rate (%)** | Yes | The percentage, e.g. `8` or `6.5`. | 0 or more; up to four decimal places. |
| **Tax type** | No | **Tax** or **Service Charge** - a label for reporting; both calculate the same way. Choosing Service Charge switches Claimable off; choosing Tax switches it on at 100%. | Defaults to Tax. |
| **Priority** | No | The order in which components apply, 1 first. Components with the same priority tax the same base; a higher priority taxes the base plus the earlier components (tax on tax). | 1 to 5; defaults to 1. |
| **Effective from** | Yes | The first date the rate applies - pick it from the calendar. | Defaults to today. |
| **Claimable** (INPUT schemes only) | No | Tick if the input tax can be recovered. | Hidden and treated as not claimable for OUTPUT schemes. |
| **Claim percentage (%)** (when Claimable) | Yes when ticked | How much of the tax is recoverable, e.g. `100`. | 0 to 100. |
| **GL account** | No | The ledger account this component posts to by default, e.g. `2100-SST`. Companies can override it on Company Tax. | Up to 50 characters. |
| **Status: Active** (editing only) | No | Untick to keep the line on record without applying it. | - |

### Load platform defaults dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search schemes** | No | Part of a code, name or country to narrow the list. | - |
| **Scheme tick boxes** | Yes (at least one) | Tick each starter scheme to copy. | Already-added schemes are greyed out; the Load button stays disabled with nothing selected. |

## Tips & troubleshooting

- If you see "Tax scheme 'X' already exists for yy." that code is already used for that country (it may be disabled); search for it and enable or edit it.
- If you see "Country is required.", "Tax scheme code is required." or "Name is required." fill in the missing field.
- If you see "A 'SR' rate effective YYYY-MM-DD already exists." a line with that code and date exists; edit that line or pick the real effective date of the change.
- If you see "Tax rate must be a non-negative number.", "Tax priority must be a whole number from 1 to 5." or "Claim percentage must be between 0 and 100." correct the value.
- If you see "Effective-from date must be a valid date (YYYY-MM-DD)." pick the date from the calendar.
- If you see "Select at least one scheme to load." tick a scheme in the Load defaults dialog.
- If the Load defaults dialog says "No platform defaults are available for your companies' countries." the platform has no starter schemes for those countries yet; add your own scheme instead.
- If the Country picker does not offer the country you need, set one of your companies to that country on Companies first.
- Keep rate history intact: never change a rate in place - add a new dated line, so last year's invoices keep last year's rate.

## Related options

- **Company Tax** (System Setup → Company Tax) - per company: switch schemes off and override GL accounts per component.
- **Companies** (System Setup → Companies) - a company's Country decides which schemes it consumes and which countries this screen offers.
- **Membership Fees** and other billing screens - pick the schemes defined here when charges are taxed.
