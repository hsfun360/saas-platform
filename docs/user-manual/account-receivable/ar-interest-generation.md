# Interest Generation

> **Where:** Account Receivable → Interest Generation
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create permission is needed to see the **Generate a month** card and the **Post** button; the Edit permission is needed for **Cancel** and for excluding or restoring lines in the drill-down.

## What this option is for

Interest Generation computes late-payment interest for a month and lets you review it before anything is posted.
The run looks at every active debtor account with "Charge late-payment interest" ticked, finds their open invoices and debit notes whose billing item is interest-chargeable and whose due date (plus any grace days) is before the cutoff, and works out a flat percentage of the remaining balance of each one.

The result is a holding list: one line per debtor showing the overdue total and the interest.
Nothing reaches the accounts until you select debtors and post.
Posting creates one interest document per debtor, which then appears on the Interest Documents screen and on statements.

## The screen at a glance

[Screenshot: Interest Generation with the run card, the month filter and the holding list]

- The **Generate a month** card at the top holds the run form: Month, Cutoff date, Rate, Grace days, any analysis dimension pickers, and the **Generate** button.
  The card folds away once you are reviewing.
- A **Month** filter above the list chooses which month's holding list to show.
- When pending lines exist, a **Select all pending** box and a **Post N interest documents - total** button appear, the total being the sum of the selected lines (listed per currency, never added across currencies).
- Each line is a card: a selection box (pending lines only), the debtor's number and name, and a currency chip on a foreign-currency account; then Overdue, Interest, Rate and Cutoff.
- The status chip sits top-right: **pending** (blue), **confirmed** (green) or **cancelled** (grey).
- Each row has **Details** and, while pending, a ⋮ menu holding **Cancel**.

## Common tasks

### Generate a month

[Screenshot: Generate a month card]

1. Pick the **Month**.
   The **Cutoff date** fills in with the last day of that month; change it if your policy uses another date.
2. Enter the **Rate (% flat)**, the monthly percentage applied once to each overdue balance, for example `1.5`.
3. Enter **Grace days** if overdue items get a few days before interest starts.
4. If analysis dimension pickers appear, choose the values every document of this run should carry; starred dimensions are compulsory.
5. Click **Generate**.

The message reports how many debtors were generated, the total per currency, and how many debtors already had a run for the month and were skipped.
The list switches to that month so you can review.

A debtor who already has a pending or confirmed line for the month is skipped; a cancelled line is replaced by the regeneration.
Debtors with no interest-chargeable overdue items produce no line.

### Review a debtor's interest

[Screenshot: Interest drill-down dialog]

1. Click **Details** on the line.
2. The dialog restates the rate and cutoff and lists every overdue document: number, due date, days late, overdue amount and the interest on that line.
   Interest is the overdue amount times the rate, rounded per line; the total equals what will be posted.
3. On a pending line, each document row has a button to **exclude** it from the run, or to **restore** an excluded one.
   Excluded rows show struck through and the totals recompute at once, both in the dialog and on the card.
   The total row reads "n of m line(s) included".

Use exclusion when one specific document should not attract interest this month, for example a disputed invoice.
Excluding every line leaves nothing to post; cancel that debtor instead.

### Post the interest

1. Tick the pending debtors you want to charge, or tick **Select all pending**.
2. Check the button label: it states how many documents will post and the total.
3. Click **Post N interest documents**.

Each confirmed line posts one interest document under the Interest-class transaction type designated in AR Specification, dated at the cutoff and carrying the run's analysis dimensions.
If some lines fail, the message names each debtor and the reason; the rest still post.

### Cancel a debtor's line

Open the ⋮ menu on a pending line and click **Cancel**.
The line is kept as cancelled for the record, and the debtor can be generated again for the same month.

## Field reference

### Generate a month

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Month** | Yes | The interest month, picked from the list. | |
| **Cutoff date** | Yes | The date overdue status is judged at, picked from the calendar. | Defaults to the last day of the month. An item is overdue when its due date plus grace days is before this date. |
| **Rate (% flat)** | Yes | The monthly percentage, for example `1.5`. | Greater than zero, up to 100; up to four decimal places. |
| **Grace days** | Yes | Days of grace after the due date before interest applies, for example `7`. | A whole number from 0 to 365; defaults to 0. |
| **Analysis dimension pickers** (one per dimension) | Yes for starred dimensions | The reporting values stamped on every document of the run. | Shown only when Analysis Setup assigns dimensions to Account Receivable. |

### Review list

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Month** filter | No | The month whose holding list to show. | Defaults to the current month. |
| **Select all pending** | No | Tick to select every pending line at once. | |

## Tips & troubleshooting

- **"Month is required (YYYY-MM)."** and **"Cutoff date is required (YYYY-MM-DD)."**
  Both the month and the cutoff must be set.
- **"Interest rate must be a percentage greater than zero."**
  Enter a positive rate such as `1.5`.
- **"Grace days must be between 0 and 365."**
  Enter a whole number in that range.
- **"Interest generated for 0 debtor(s) - total 0.00. 3 debtor(s) already had a run this month."**
  Nothing new was generated: either every eligible debtor already has a line this month, or no debtor has interest-chargeable overdue items at the cutoff.
  Check the account's "Charge late-payment interest" setting and the billing items' "Charge late-payment interest on overdue items" flag.
- **"Only a pending generation can be maintained (this one is confirmed)."**
  Lines can be excluded or restored only before posting.
- **"Every line is excluded - nothing to post. Cancel this debtor instead."**
  A line with no included documents cannot post; cancel it.
- **"Tax scheme 'X' could not be resolved."**
  The Interest-class transaction type points at a tax scheme the company cannot use; fix it under Transaction Type or AR Specification.
- **"Select at least one generation to confirm."**
  Tick at least one pending line before posting.
- **"This generation is already confirmed."**
  A posted line cannot be cancelled; correct the interest document with a Credit Note.
- Interest is flat per month with no day proration; days late are shown for information.
- Run the generation after the month's receipts are keyed, so balances already paid are not charged.

## Related options

- **Account Receivable → Interest Documents** - the posted interest charges, with their breakdown and the Raise Credit Note action.
- **Account Receivable → Debtor Listing** - the per-account "Charge late-payment interest" switch.
- **Account Receivable → Transaction Type** - the "Charge late-payment interest on overdue items" flag per billing item, and the Interest-class entry.
- **Account Receivable → AR Specification** - which Interest-class entry the run posts under.
- **Account Receivable → Analysis Setup** - the dimensions offered on the run form.
