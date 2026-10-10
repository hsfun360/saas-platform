# Platform Tax

> **Where:** SaaS Administration → Configuration → Platform Tax
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> **New scheme** needs the Create permission, **Edit** and **Enable/Disable** of a scheme and **Edit** of a rate line need the Edit permission, and **Delete** of a rate line needs the Delete permission; a role without a permission simply does not see that button.

## What this option is for

Platform Tax is the platform's own tax catalogue, defined per country, and it does two jobs at once.
First, it taxes what the platform charges its subscribers: the Platform Profile picks one of these schemes as the default for every platform charge such as the Subscription Fee.
Second, it is the starter catalogue subscribers copy from: when a Tenant Admin clicks "Load defaults" on their Tax Setup screen, they see exactly the schemes curated here for their companies' countries, and take a copy they then own and maintain themselves.
A scheme is a named tax (e.g. Malaysia SST output) with a price treatment (inclusive or exclusive), a class (input or output), and one or more effective-dated rate lines; a rate change is always a new line with a later date, never an edit of the old one, so posted documents keep the rate they were charged.
Staff come here to add a country's standard taxes, record a rate change from a given date, or retire a scheme.

## The screen at a glance

[Screenshot: Platform Tax with a scheme selected]

- Two panes on a desktop: the scheme list on the left (the master) and the selected scheme's details on the right.
  On a phone they show one at a time, with a **Back to schemes** button on the detail.
- A count line at the top of the list, e.g. "6 schemes, 5 active".
- A **Country** filter appears above the search box once schemes exist for more than one country.
- A search box filters as you type, matching the scheme code, name, description and country name.
- Each scheme is a card showing its country flag, the code and name on the title line, and the price treatment and class on the sub-line (with a bell icon when the scheme includes a Service Charge line).
  Active schemes are listed first, then by country and code.
- A status chip on the right shows **Active** or **Disabled**; each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New scheme** button floats at the bottom right of the list.
- The detail pane shows the scheme's heading, its Country, Price treatment and Class, the description, then the **Rate lines** with an **Add rate** button.
  Each rate line shows the tax code, the rate, tags for its type, priority, claimability, GL account and status, the effective date, an **Edit** button and a ⋮ menu holding **Delete**.
- The open scheme is part of the page address, so you can bookmark it and use the browser back button.

## Common tasks

### Add a scheme

[Screenshot: New tax scheme dialog]

1. Click **New scheme**.
2. Pick the **Country** the tax belongs to; type a few letters to filter.
3. Type the **Scheme code**, e.g. `SST-OUT`, and the **Name**, e.g. `Sales & Service Tax (Output)`.
4. Choose the **Price treatment** (EXCLUSIVE adds the tax on top of the price; INCLUSIVE means the price already contains it) and the **Tax class** (OUTPUT for tax collected on sales, INPUT for tax paid on purchases).
5. Optionally type a **Description**.
6. Click **Save**.

The new scheme opens in the detail pane with no rate lines yet; add at least one before it can tax anything.

### Add a rate line

[Screenshot: Add rate line dialog]

1. Open the scheme and click **Add rate**.
2. Type the **Tax code** for this component, e.g. `SR`, and the **Rate (%)**, e.g. `8`.
3. Choose the **Tax type** (Tax or Service Charge) and the **Priority** (1 to 5).
   Lines with the same priority apply side by side to the same base; a higher priority applies on top of the running total, which is how a service charge at priority 1 and a tax on top at priority 2 are modelled.
4. Pick the **Effective from** date.
5. For an INPUT scheme only, tick **Claimable (recoverable input tax)** and set the **Claim percentage (%)**.
   Choosing Tax type Tax presets claimable 100%; choosing Service Charge presets not claimable.
6. Optionally type the **GL account**.
7. Click **Save**.

### Record a rate change

1. Do not edit the existing line.
2. Click **Add rate**, use the same **Tax code**, enter the new **Rate (%)** and the date the change takes effect in **Effective from**.
3. Click **Save**.

The active rate on any date is the line with the latest effective date on or before that date, so the old line keeps governing documents dated before the change.

### Edit or delete a rate line

- Click **Edit** on the line to correct a mistake (code, rate, type, priority, date, claimability, GL account) or to untick **Active**, which retires the line without deleting it.
- Open the ⋮ menu on the line and click **Delete** to remove it.
  The line is removed immediately; there is no confirmation step, so prefer unticking **Active** for a line that may have been used.

### Edit, disable or enable a scheme

- Click **Edit** on the scheme card to change its code, name, price treatment, class or description; the country is shown but cannot be changed.
- Open the ⋮ menu on the card and click **Disable** to stop the scheme being used or offered to subscribers as a default; existing copies subscribers already took are unaffected.
  Click **Enable** to bring it back.

### Find a scheme

- Use the **Country** filter to show one country, and the search box for a code, name or country name.
- Click the ✕ in the search box, or **Clear search** on the "no matches" message, to see the full list again.

If you try to leave the scheme or rate dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

## Field reference

### Scheme card (read-only)

| Field | What it shows |
| --- | --- |
| **Flag, code and name** | The country flag, then the scheme code and name. |
| **Sub-line** | The price treatment and tax class, and a bell icon when a Service Charge line exists. |
| **Status chip** | **Active** or **Disabled**. |

### New / Edit tax scheme dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Country** | Yes | The country whose tax this is, picked from the active countries. Subscribers in that country see this scheme in Load defaults. | Cannot be changed after creation. |
| **Scheme code** | Yes | A short code unique within the country, e.g. `SST-OUT`. | Up to 50 characters; must not already exist for that country. |
| **Name** | Yes | The scheme's full name, e.g. `Sales & Service Tax (Output)`. | Up to 150 characters. |
| **Price treatment** | Yes | EXCLUSIVE (tax is added on top of the price) or INCLUSIVE (the price already contains the tax). | - |
| **Tax class** | Yes | OUTPUT for tax collected on sales, INPUT for tax paid on purchases (which may be claimable). | - |
| **Description** | No | An optional summary. | Up to 255 characters. |

### Add / Edit rate line dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Tax code** | Yes | The code of this tax component, e.g. `SR`. Several codes can be effective at once within one scheme. | Up to 50 characters; one line per code per effective date. |
| **Rate (%)** | Yes | The percentage, e.g. `8` or `6.5`. | 0 or more; up to four decimal places. |
| **Tax type** | No | Tax or Service Charge; descriptive only, carried for reporting - it does not change the calculation. | Defaults to Tax. |
| **Priority** | No | 1 to 5; lines sharing a priority apply to the same base, and each higher priority applies to the running total including the earlier tiers. | Defaults to 1. |
| **Effective from** | Yes | The first date this line applies, picked from the calendar. | Defaults to today. |
| **Claimable (recoverable input tax)** | No | INPUT schemes only: tick if the tax can be reclaimed. | Hidden and forced off for OUTPUT schemes. |
| **Claim percentage (%)** | Yes when claimable | How much of the tax is reclaimable, e.g. `100`. | 0 to 100; shown only while Claimable is ticked. |
| **GL account** | No | The ledger account this component posts to. | Up to 50 characters. |
| **Status (Active)** | No | Editing only: untick to retire the line without deleting it. | - |

## Tips & troubleshooting

- If you see "Country is required.", "Tax scheme code is required." or "Name is required." fill in those boxes.
- If you see "Tax scheme 'SST-OUT' already exists for my." the code is already used for that country; pick another code or edit the existing scheme.
- If you see "A 'SR' rate effective 2026-01-01 already exists." there is already a line for that code on that date; edit it instead of adding another.
- If you see "Tax rate must be a non-negative number.", "Tax priority must be a whole number from 1 to 5.", "Claim percentage must be between 0 and 100." or "Effective-from date must be a valid date (YYYY-MM-DD)." correct the rate line accordingly.
- If you see "Tax scheme not found." or "Rate line not found." the record no longer exists; refresh the list and try again.
- If you see "Failed to load tax schemes.", "Failed to save tax scheme.", "Failed to save rate line." or "Failed to remove rate line." something went wrong on the server; try again, and contact support if it persists.
- Subscribers copy schemes, they do not link to them: changing a rate here does not update a copy a subscriber already loaded, so tell subscribers about statutory rate changes.
- A country's flag and name come from the Countries screen; a scheme for a country that is disabled there shows its code instead of a name.
- There is no Load defaults button on this screen: this catalogue is the source the subscribers load from.

## Related options

- **Platform Profile** (SaaS Administration → Configuration → Platform Profile) - picks one scheme here as the default for platform charges and offers a test calculation.
- **Countries** (SaaS Administration → Reference data → Countries) - supplies the Country picker and flags.
- **Tax Setup** (System Setup → Tax Setup, used by Tenant Admins) - where subscribers load copies of these schemes and maintain their own.
- **e-Invoice Tax Types** (SaaS Administration → Reference data → e-Invoice Tax Types) - the LHDN labels stamped on e-Invoices, separate from the schemes defined here.
