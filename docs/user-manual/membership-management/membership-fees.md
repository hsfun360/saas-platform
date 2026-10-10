# Membership Fee

> **Where:** Membership Management → Membership Fee
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create, Edit and Delete permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

The Membership Fee screen defines the recurring fees your club charges its members - for example an annual subscription or a monthly fee - with the amount, the tax scheme, the Account Receivable billing item the invoices post under, and an optional installment schedule.
A fee defined here is picked as the default fee of a Membership Type and assigned to each membership; the Billing Schedules screen then raises the invoices.
When a fee allows installments, you split the amount into stages (for example 4 quarterly stages) and billing posts one stage at a time.
Staff come here when setting up the club's fee structure, changing an amount for the coming year, or retiring a fee that is no longer sold.

## The screen at a glance

[Screenshot: Membership Fee list]

- A count line reads e.g. "5 fees, 4 active".
- A search box filters the list as you type, matching the fee code, description and tax scheme.
- Each fee is a card: the fee code as the title, then a sub-line with the amount, the description, the tax scheme and either "Single payment" or the schedule, e.g. "4 × Quarterly".
- A status chip top-right shows **Active** or **Disabled**; active fees are listed first.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New fee** button floats at the bottom right of the screen.

## Common tasks

### Add a new fee

[Screenshot: New membership fee dialog]

1. Click **New fee**.
2. Enter the **Membership fee code** and optionally pick the **Tax scheme**.
3. Pick the **AR transaction type** - the billing item this fee's invoices will post under.
4. Optionally add a **Description**, then enter the **Amount**.
5. Leave **Allow installment** unticked for a single payment, or tick it to split the fee (see below).
6. Click **Save**.

The fee appears in the list and can be chosen on Membership Types and memberships.

### Set up an installment schedule

[Screenshot: Installment schedule inside the fee dialog]

1. Tick **Allow installment**.
2. Enter the **No. of installments** and pick the **Installment interval** (Monthly, Quarterly, Half Yearly or Annually).
3. Click **Generate schedule** - the system splits the amount equally into that many stages, putting any rounding difference on the last stage.
4. Adjust individual stage amounts if your club front-loads or back-loads the fee.
   The line under the stages shows "Stages total: X / Y" and reads "✓ balanced" only when the stages add up to the fee amount.
5. Click **Save**.

Each stage shows **Posted** or **Not posted**; a stage becomes Posted once billing has invoiced it, and that mark survives later edits of the schedule.
Unticking **Allow installment** clears the schedule.

### Edit a fee

1. Find the fee (use the search box if the list is long) and click **Edit**.
2. Change what you need; regenerate the schedule if you changed the amount or the number of installments.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a fee

- Open the card's ⋮ menu and click **Disable** to retire a fee you no longer sell.
  Memberships already on the fee keep it; the fee simply disappears from pickers.
- Open the ⋮ menu of a disabled fee and click **Enable** to bring it back.

Fees are never deleted, because memberships and bills may already reference them.

## Field reference

### New membership fee / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Membership fee code** | Yes | A short code that identifies the fee on membership records and bills, e.g. `ANNUAL`. | Up to 50 characters; must be unique within the company. |
| **Tax scheme** | No | The tax applied when this fee is billed; leave as None for a tax-free fee. Only sales (output) tax schemes of your company's country are offered. | Set the company's country on the Companies screen first, or the list is empty. |
| **AR transaction type** | Yes | The Account Receivable billing item the fee's invoices post under; type to filter by code or description. | Must be an active Invoice-class entry opened to Membership on Account Receivable → Transaction Type. |
| **Description** | No | A short explanation shown on the fee card, e.g. `Annual subscription for ordinary members`. | Up to 200 characters. |
| **Amount** | Yes | The full fee amount in your company currency, e.g. `1200.00`. | 0.00 or more; always shown with two decimals. |
| **Allow installment** | No | Tick if the fee is collected in stages rather than one payment. | Turning it on reveals the three installment fields below. |
| **No. of installments** | Yes, when installments are allowed | How many stages the amount is split into, e.g. `4`. | A whole number from 1 to 120. |
| **Installment interval** | Yes, when installments are allowed | How often a stage falls due: Monthly, Quarterly, Half Yearly or Annually. | One of the four values. |
| **Installment schedule** (Stage 1 … N) | Yes, when installments are allowed | The amount of each stage; **Generate schedule** fills them in equally and you may then edit them. | There must be exactly as many stages as installments, each 0.00 or more, and together they must total the fee amount. |

## Tips & troubleshooting

- If you see "Membership fee 'X' already exists." another fee in this company already uses that code.
- If you see "Select the AR transaction type this fee posts under." or "The transaction type must be an active Invoice-class entry opened to Membership (AR → Transaction Type master)." pick a billing item from the list; if the list is empty, open an Invoice-class transaction type to Membership on Account Receivable → Transaction Type first.
- If you see "Enter a whole number of installments first." or "Enter the fee amount before generating the schedule." fill in both fields before clicking **Generate schedule**.
- If you see "Generate the schedule so it has N stage(s)." you changed the number of installments after generating; click **Generate schedule** again.
- If you see "Stage amounts must total the fee amount (X)." or "Installment stages must total the fee amount (X), but they total Y." adjust the stages until the total line reads balanced.
- If you see "Number of installments must be a whole number between 1 and 120." correct the count.
- If the Tax scheme list is empty and the dialog says "Set this company's country to use tax schemes.", set the country on System Setup → Companies.
- If you see "Your role's data scope does not allow amending this record." the fee was created by someone outside your data scope; ask your administrator.
- Keep one fee per billing pattern (e.g. `ANNUAL`, `MONTHLY`, `LIFE-ONCE`) and change the amount here when prices change; memberships pick up the fee by code.

## Related options

- Membership Management → Membership Type - each type names its default fee, applied to new memberships.
- Membership Management → Memberships - the fee assigned to each membership.
- Membership Management → Billing Schedules - the fee runs that invoice these fees.
- Account Receivable → Transaction Type - the billing items a fee posts under.
- System Setup → Tax Setup and System Setup → Companies - the tax schemes offered depend on the company's country.
