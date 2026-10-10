# Numbering Control

> **Where:** Account Receivable → Numbering Control
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create permission is needed for **New numbering scheme** and **Copy from company**; the Edit permission for **Edit** and **Enable** / **Disable**.

## What this option is for

Numbering Control decides how each kind of Account Receivable document gets its number: generated automatically from a format and a running counter, or keyed by staff.
There is one scheme per document series: Invoice No., Debit Note No., Credit Note No., Interest No., Deposit No., Official Receipt No., Refund No., Statement No. and Other Debtor Code.

Automatic numbers are issued the moment a document is saved and never skip or repeat; a voided draft keeps its number and its void reason explains the gap.
With manual numbering, the entry dialogs require the number and only check that it has not been used before.

## The screen at a glance

[Screenshot: Numbering Control list]

- **Copy from company** at the top right copies series configuration from another company you have access to.
- Each scheme is a card: the series name as the title; a sub-line with the mode and, for automatic schemes, the next number that will be issued and the reset rule ("Auto-generate · Next: INV-00042 · Resets Never (continuous)").
- The status chip sits top-right: **Active** or **Disabled**.
- Each row has **Edit** and a ⋮ menu holding **Enable** or **Disable**.
- **New numbering scheme** sits bottom-right while at least one series is still unconfigured.

## Common tasks

### Set up a series

[Screenshot: New numbering scheme dialog]

1. Click **New numbering scheme**.
2. Choose the series under **Numbers**, for example Invoice No.
   Only series without a scheme are offered.
3. Choose **How it's assigned**: **Auto-generate** or **Manual entry**.
4. For automatic numbering, build the pattern:
   - **Prefix** - a fixed text such as `INV`.
   - **Format** - the template, built from the tokens shown under the field: click a token to append it.
     `{PREFIX}{SEQ}` gives `INV00001`; `{PREFIX}-{YYYY}-{SEQ}` gives `INV-2026-00001`.
   - **Sequence digits** - how many digits the running number is padded to.
   - **Starting number** - the first number issued, and the number the counter returns to after a reset.
   - **Reset sequence** - Never (continuous), Annually or Monthly.
5. Read **Next number will look like** to confirm the pattern.
6. Click **Save**.

For manual entry the pattern fields disappear: staff key the number on each document and the system only checks it is unused.

### Edit a scheme

1. Click **Edit** on the row.
2. Change the mode or the pattern.
   The series itself cannot be changed.
   The preview shows what the next number will be, based on the counter already reached.
3. Click **Save**.

Changing the format does not renumber existing documents.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Disable or enable a scheme

- Open the ⋮ menu and click **Disable** to stop the series.
  The scheme keeps its counter; while it is disabled the series behaves as if no scheme existed, so documents of that kind ask for a manual number.
- Click **Enable** to resume it.

### Copy series from another company

[Screenshot: Copy numbering dialog at the selection step]

1. Click **Copy from company** and pick the company.
   Only companies you have access to are listed.
2. The next step previews each of that company's active series with its mode, the first number it would issue here and its reset rule.
   Series already configured here are marked and cannot be selected; new ones are pre-selected.
3. Untick anything you do not want, then click **Copy N scheme(s)**.

Only the configuration is copied; numbering here always starts fresh from the starting number.

## Field reference

### New / Edit numbering scheme

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Numbers** | Yes | The series this scheme numbers, for example Official Receipt No. | One scheme per series; fixed after creation. |
| **How it's assigned** | Yes | Auto-generate or Manual entry. | |
| **Prefix** | No | A fixed text inserted by the `{PREFIX}` token, for example `OR`. | Up to 20 characters; automatic mode only. |
| **Reset sequence** | Yes in automatic mode | Never (continuous), Annually or Monthly. | Automatic mode only. |
| **Format** | Yes in automatic mode | The template of tokens, for example `{PREFIX}-{YY}{MM}-{SEQ}`. | Up to 60 characters. Tokens: `{PREFIX}`, `{SEQ}` (padded sequence), `{YYYY}`, `{YY}`, `{MM}`, `{TYPE}`. `{TYPE}` is the membership type code and only applies to membership numbers. |
| **Sequence digits** | Yes in automatic mode | The padded width of the running number, for example `5` gives `00042`. | A whole number from 0 to 12. |
| **Starting number** | Yes in automatic mode | The first number issued, for example `1` or `1001`. | A whole number of at least 1. |

## Tips & troubleshooting

- **"A numbering scheme for this purpose already exists."**
  Each series has one scheme; edit the existing one.
- **"Sequence padding must be a whole number from 0 to 12."** and **"Starting number must be a whole number of at least 1."**
  Correct the number fields.
- **"A format is required (use 60 characters or fewer)."**
  Automatic numbering needs a format; `{PREFIX}{SEQ}` is the simplest.
- **"Select at least one numbering scheme to copy."**
  Tick at least one series in the copy dialog.
- **"You have access to no other company to copy from."**
  Copying needs a second company in which you hold an active membership.
- An entry dialog that shows "Issued on save" means the series is automatic; one that asks for the number means it is manual or has no active scheme.
- Include the year in the format when the sequence resets annually, otherwise numbers repeat from one year to the next.

## Related options

- **Account Receivable → Invoices**, **Debit Notes**, **Credit Notes**, **Official Receipts**, **Refunds** and **Deposits** - the entry dialogs that consume these series.
- **Account Receivable → Interest Generation** - posts interest documents under the Interest No. series.
- **Account Receivable → Statement Generation** - issues Statement No.
- **Account Receivable → Debtor Listing** - the Other Debtor Code series.
- **Membership Management → Numbering Control** - the separate membership number series.
