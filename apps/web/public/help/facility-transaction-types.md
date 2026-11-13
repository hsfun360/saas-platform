# Transaction Types

> **Where:** Facility Management → Transaction Types
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New transaction type button needs the Create permission for this screen; Edit, Pricing (adding, editing, enabling and disabling prices) and Enable/Disable need the Edit permission; deleting a price also needs the Delete permission.

## What this option is for

The Transaction Types screen is the club's catalog of Facility Management billing items - everything that can be charged on a facility bill: the hire of a court or a hall, a guest fee, the charge for a Utility Item such as a locker or a towel, a class fee, a no-show charge and miscellaneous items.
Each item carries its charge type, its fee basis (how many lines it puts on a bill), the facility type it belongs to, the tax scheme applied when it is billed, and its own effective-dated prices.
An item marked as the default for a participant type is the one charged automatically for that kind of participant when a bill opens.
Staff come here when the club introduces a charge or changes a price - a price card with a future effective date pre-sets a price change.
The items defined here are picked on Facility Types (the fees charged automatically), on Utility Items (the fee of a locker, towel or shower) and on Classes (the class fee items).

## The screen at a glance

[Screenshot: Transaction Types list]

- A count line shows how many transaction types exist and how many are active.
- A search box filters the list as you type; it matches the code, the description, the charge type and the facility type code.
  When nothing matches, **Clear search** brings the whole list back.
- Each item is a card: its icon (or a receipt symbol when it has none), the code and description as the title, then the charge type, the fee basis, the facility type it belongs to (or "Any facility type"), "Default for ..." when it is a default item, "Tax ..." when it carries a tax scheme, and the number of price cards.
- A status chip shows **Active** or **Disabled**; active items are listed first, then by code.
- Each card has an **Edit** button and a ⋮ menu holding **Pricing (n)** and **Enable** or **Disable**.
  A card you may not amend under your role's data scope shows no actions.
- The **New transaction type** button sits at the bottom right.

## Common tasks

### Add a billing item

[Screenshot: New transaction type dialog]

1. Click **New transaction type**.
2. Enter the **Transaction Type** code (e.g. `BADM`) and pick the **Charge Type**:
   - **Facility Fee** - the hire of a slot (a court, a hall); priced by participant type, day and session.
   - **Guest Fee** - charged per guest participant; priced by participant type, day and session.
   - **Issue Fee** - the charge for a Utility Item (a locker, a towel, a shower) at the Control Station; one flat amount.
   - **Class Fee**, **No Show Charges**, **Miscellaneous** - one flat amount.
3. Enter a **Description**.
4. Check the **Fee Basis**: **Per slot** (one line per reserved slot), **Per participant** (one line per matching participant) or **Per booking** (one line).
   The system pre-selects Per slot for a Facility Fee, Per participant for a Guest Fee and Per booking for No Show Charges; change it if your club bills differently.
5. Pick a **Facility Type** to tie the item to one facility type, or leave it as **Any facility type**.
6. For a Facility Fee or a Guest Fee, optionally pick **Default for participant type** to make this the item charged automatically for that kind of participant; leave it as **Manual item - picked from the tiles** otherwise.
7. Pick the **Tax Scheme** applied when the item is billed; leave it as **No tax** for a tax-free item.
8. Tick **Cashier may amend the resolved price at billing** only if the cashier may change the pre-set price on a bill.
9. Optionally click **Upload icon** to give the item a picture for the billing tiles.
10. Click **Save**, then open **Pricing** from the card's ⋮ menu to add its prices.

The item appears in the list with "0 price cards".
At billing an item with no price card in force is refused with a message asking you to set up its pricing first.

### Set or change the prices (Pricing)

[Screenshot: Pricing view with its price cards]

1. Open the card's ⋮ menu and click **Pricing (n)**.
2. The view lists the item's price cards, newest first.
   Each card shows its effective date ("From ...") and a chip: **In force** (its date has arrived), **Future** (its date is still to come) or **Disabled**.
   A Facility Fee or Guest Fee card lists every price row; any other card shows its flat amount.
3. Click **Add price**.
4. Pick the **Effective date** - the card is in force from this date until a later card takes over.
5. Enter the prices:
   - For a Facility Fee or a Guest Fee, fill the **Prices** rows: one row per **Participant**, with the **Days** it applies to (All days, Weekdays or Weekends), optionally a **Session**, and the **Amount**.
     A new card starts with one row per participant type, on all days and any session.
     Click **Add price row** where the price differs on weekends or in a session, and the ✕ at the end of a row to remove it.
     If you removed every row, **One row per participant type** brings the starting rows back.
   - For any other charge type, enter the single **Amount**.
6. Click **Save n prices** (or **Save** for a flat amount).

[Screenshot: New price view with price rows]

Amounts exclude tax; the item's tax scheme is applied at billing.
On a booking date the system uses the active card with the latest effective date on or before that date.
Within that card the most specific row wins: an exact session over "Any session", and Weekdays or Weekends over "All days".
Weekend days follow your company's weekend days, and public holidays count as weekends.
A participant with no matching row cannot be billed the item, so cover every participant type you serve.
To change a card later, click **Edit** on it; **Back to list** returns to the price cards without saving.
Click **Close** when you have finished with the item's prices.

### Disable, enable or delete a price

- Open a price card's ⋮ menu and click **Disable** to take it out of use; billing then falls back to the next active card on or before the date.
- Click **Enable** in the same menu to bring it back.
- **Delete** is offered only on a **Future** card.
  The system asks you to confirm: "Only a future-dated price can be deleted; one already in force is history and is disabled instead."
  Click **Delete price** to confirm.

### Edit a transaction type

1. Find the item (use the search box if the list is long) and click **Edit**.
2. Change what you need.
   The **Charge Type** is frozen once the item has a price card, because the shape of its prices follows the charge type.
3. Click **Save**.

If you leave without saving, the system asks whether to discard your changes or keep editing.

### Disable / enable a transaction type

- Open the ⋮ menu and click **Disable** to retire an item you no longer bill.
  It stays on this screen and on past bills, is no longer charged automatically as a default, and can no longer be saved as the fee item of a Utility Item or a Class.
- Click **Enable** to bring it back.
  A default item can only be re-enabled while no other active item holds the same default.

## Field reference

### New / Edit transaction type dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Transaction Type** | Yes | The item's code, shown as the label on the billing tile, e.g. `BADM`. | Up to 50 characters; stored in capitals; must be unique within the company. |
| **Charge Type** | Yes | Facility Fee, Guest Fee, Issue Fee, Class Fee, No Show Charges or Miscellaneous. It decides how the item is priced: Facility Fee and Guest Fee by participant, day and session; the others by one flat amount. | Frozen once the item has a price card. |
| **Description** | No | What the item is, e.g. `Badminton court hire`. | Up to 255 characters. |
| **Fee Basis** | Yes | How many lines the item puts on a bill: Per slot (one per reserved slot), Per participant (one per matching participant) or Per booking (one line). | Pre-selected when you pick a Facility Fee, Guest Fee or No Show Charges; you may change it. |
| **Facility Type** | No | The facility type this fee belongs to, e.g. the badminton courts; its prices then apply to that type only. | Leave as Any facility type for an item usable on every type. |
| **Default for participant type** | No | The kind of participant this item is charged to automatically when a bill opens. Leave it as "Manual item - picked from the tiles" for an item the cashier adds by hand. | Shown for Facility Fee and Guest Fee only; at most one active default per charge type, facility type and participant type. |
| **Tax Scheme** | No | The tax applied when the item is billed; every bill line keeps the scheme it was billed with. | Type to search; No tax = a tax-free item; only your company's output tax schemes are offered. |
| **Cashier may amend the resolved price at billing** | No | Tick to let the cashier change the price the system worked out for a bill line. | Off = the price card is binding. |
| **Icon** | No | A picture for the billing tile; click Upload icon, then Replace icon or Remove later. | An image file up to 2 MB; square images look best. |

### Pricing - New / Edit price

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Effective date** | Yes | The date this price card comes into force; pick it from the calendar. | One card per date per item. |
| **Amount** | Yes | The single price of an Issue Fee, Class Fee, No Show Charges or Miscellaneous item, e.g. `15.00`. | 0.00 or more; always shown with two decimals; tax-exclusive. |

### Pricing - price rows (Facility Fee and Guest Fee)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Participant** | Yes | The participant type this row prices, e.g. Member. | One of the club's active participant types. |
| **Days** | No | All days, Weekdays or Weekends. | Starts as All days; public holidays count as weekends. |
| **Session** | No | A session band from Facility Specification, e.g. a peak band, when the price differs by time of day. | Any session = the row prices every session. |
| **Amount** | Yes | The price of this row, e.g. `40.00`. | 0.00 or more; always shown with two decimals; tax-exclusive. |

A card needs at least one row and can hold up to 400 rows; the same participant, days and session combination can appear only once.

## Tips & troubleshooting

- If you see "Transaction type 'BADM' already exists." the code is taken; edit that item instead or pick another code.
- If you see "'BADM' is already the active facility fee default for member on this facility type." (or "... on any type.") another active item already holds that default; disable it or clear its default first.
- If you see "The charge type is frozen: 'BADM' already has 2 price cards." the item already has prices; create a new item for the other charge type instead.
- If you see "Tax scheme not found for this company (or is an INPUT scheme)." pick one of the output tax schemes offered in the list.
- If you see "A price effective 1 Jan 2027 already exists." edit that card instead of adding a second one for the same date.
- If you see "This price is already in force - disable it instead of deleting." the card's date has arrived; disable it to keep the history intact.
- If you see "Add at least one price row.", "Every price row needs a participant type.", "Duplicate price row for Member (All days, Any session)." or "Price for Member must be 0.00 or more." correct the price rows and save again.
- If you see "The amount must be 0.00 or more." enter the flat amount.
- If you see "Price cell names a session that is not on the Facility Specification." the session was removed from Facility Specification; pick another session or Any session.
- If a bill says "'BADM' has no price card in force on <date> - set up its pricing first." the item has no active price card on or before that date; add one under Pricing.
- If a bill says "'BADM' has no price for guest / weekend on <date> - add that cell to its price card." the card in force has no row for that participant and day; add the row.
- If a bill says "'BADM' has no amount on its price card in force on <date>." open that card under Pricing and enter its amount.
- If you see "Your role's data scope does not allow amending this record." the record belongs to someone outside your data scope; ask an administrator.
- When no sessions are defined on Facility Specification, every price row prices any session.
- To raise a price from a known date, add a new card with that effective date instead of editing the card in force; the old card stays as history.

## Related options

- Facility Management → Facility Types - picks the Facility Fee (or entry fee) and the Guest Fee item charged automatically for a facility type.
- Facility Management → Utility Items - picks the Issue Fee item charged per unit, piece or use.
- Facility Management → Classes - picks the Class Fee items for members and visitors.
- Facility Management → Participant Types - the participant types offered for defaults and price rows.
- Facility Management → Facility Specification - the Sessions that price rows can follow.
- Facility Management → Payment Types - the tenders a facility bill is settled with.
- System Setup → Tax Setup - the tax schemes offered here.
- System Setup → Companies → Weekend days, and Public Holidays - decide which dates take the weekend price.
