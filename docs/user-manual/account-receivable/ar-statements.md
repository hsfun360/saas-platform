# Statement Listing

> **Where:** Account Receivable → Statement Listing
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Edit permission is needed for **Void**; viewing and downloading need the menu only.

## What this option is for

The Statement Listing shows the statements of account produced by Statement Generation, one per debtor per month.
Each statement is frozen at generation: the club letterhead, the debtor's billing name and address, the documents of the period with a running balance, the deposit held and the aging buckets never change afterwards, even if documents or settings change later.

Come here to look up a debtor's statement, download it as a PDF to send or print, or void a statement that should not have been issued.

## The screen at a glance

[Screenshot: Statement Listing with the month and category filters and statement cards]

- A **Statement Month** filter chooses the month shown; it starts on the current month.
- A **Category** filter narrows to **Individual**, **Corporate**, **Nominee** or **Other Debtor**, or shows all.
- Each statement is a card: the statement number and the billing name as the title; a sub-line with the debtor number, the category chip and a currency chip on a foreign-currency account; then Period, Opening and Closing balances.
- The status chip sits top-right: **generated** or **sent** in green, or **void** in grey.
- Each row has **View** and, while not void, a ⋮ menu holding **Void**.
- When the month has no statements, the screen points you to Statement Generation.

## Common tasks

### View a statement

[Screenshot: Statement viewer dialog]

1. Click **View** on the row.
2. The viewer shows the statement as it will print: the club letterhead with registration number and address; the debtor's billing name, number, address and contact person; the statement date, the currency on a foreign-currency account and the deposit held; the opening balance, one line per document with the columns your company configured, and the closing balance; then the aging strip with each bucket, the unallocated credit in brackets and the total.
3. Click **Close** when done.

The columns, their order and headings follow the layout saved in AR Specification at the time the statement was generated.

### Download the PDF

1. Open the statement with **View**.
2. Click **Download PDF**.

The file is named after the statement number and renders the same frozen data; a voided statement prints with a VOID marker.

### Void a statement

1. Open the row's ⋮ menu and click **Void**.
2. The statement is marked void at once and stays in the list for the record.

Void a statement that was issued in error, then regenerate the month on Statement Generation if a corrected one is needed; a void statement does not block regeneration.

### Find a statement

Change the **Statement Month** to the month it was generated for, and narrow by **Category** if the list is long.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Statement Month** | No | The month to list, picked from the list. | Defaults to the current month. |
| **Category** | No | All categories, Individual, Corporate, Nominee or Other Debtor. | |

This screen has no entry form; statements are produced on Statement Generation.

## Tips & troubleshooting

- **"This statement is already void."**
  The statement was voided before; nothing more to do.
- **"Failed to download the statement PDF."**
  Try again; if it persists, open the statement with View to confirm it loads.
- An empty month usually means the run has not been generated yet; check Recent runs on Statement Generation.
- The aging buckets printed on a statement are the boundaries in force when it was generated; changing AR Specification later does not alter it.
- The unallocated figure shows receipt credit not yet applied to any document, in brackets; buckets plus unallocated always equal the closing balance.

## Related options

- **Account Receivable → Statement Generation** - produces, replaces and resumes the monthly runs.
- **Account Receivable → AR Specification** - the cutoff day, aging boundaries and PDF layout frozen into each statement.
- **Account Receivable → Debtor Listing** - the live account the statement was taken from.
