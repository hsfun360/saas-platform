# Invoices

> **Where:** Account Receivable → Invoices
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create, Edit and Delete permissions granted on the menu decide which buttons you see: without Create there is no **New Invoice** button and no **Submit**, and without Edit there is no **Edit** or **Void**.

## What this option is for

The Invoices screen is where you raise manual invoices against any debtor account and follow them through their life: keyed as an Open draft, submitted for posting (directly or through an approval chain), and finally settled by receipts or credit notes.
Invoices produced automatically by other parts of the system, such as membership fee runs, appear in the same list with a chip naming where they came from.

An invoice is a billing document.
Once posted, its amount becomes part of what the debtor owes and it ages towards its due date.
A posted invoice is never edited or voided; if it is wrong, you raise a Credit Note against it.

## The screen at a glance

[Screenshot: Invoices list with the search box, date range, status filter and document cards]

- A search box filters by document number or description as you type.
- Two date fields limit the list to invoices dated in a window.
  The window starts as the current month; picking a From date snaps the To date to the last day of that month, the To date can never be earlier than the From date, and **All dates** clears both so a number search can find a document keyed into the wrong month.
- A status filter offers **All statuses**, **Open**, **Pending Approval**, **Posted** and **Void**.
- Each invoice is a card: the document number and the debtor's name as the title; a sub-line with the debtor's account number, a currency chip when the account is in a foreign currency, a chip naming the source module when the invoice was not keyed here, the description, and the void reason on a voided invoice; then Date, Amount, Balance (posted invoices only) and Due.
- The status chip sits top-right: **Open** (an editable draft that does not yet affect the account), **Pending Approval** (submitted into an approval chain), **Posted** (financial, with its remaining balance shown) or **Void**.
- An Open invoice within your data scope shows **Edit** and a ⋮ menu holding **Submit** and **Void**.
- A posted invoice shows a ⋮ menu holding **Allocations** and, when your role may create credit notes, **Raise Credit Note**.
- **Load more** appears at the bottom when more invoices match than are shown, with the count so far.
- **New Invoice** sits bottom-right.

## Common tasks

### Raise a new invoice

[Screenshot: New Invoice dialog at the debtor picker step]

1. Click **New Invoice**.
2. Find the debtor: type part of the account number, name or code and click the row.
   Each row shows the number, the name, the account type and the current outstanding amount.
   Only active debtor accounts are offered.
3. The form opens with the debtor shown in a band at the top; click **Change** if you picked the wrong one.

[Screenshot: New Invoice dialog entry form]

4. Check **Invoice no.**.
   With automatic numbering it reads "Issued on save" and the number is assigned when you save.
   With manual numbering you must key it.
5. Pick the **Transaction type** (the billing item).
   Only Invoice-class items from the Transaction Type master are offered.
   Tax, if any, comes from the item's tax scheme and is added on top of the amount you enter.
6. Confirm the **Document date** and **Transaction date (period)**.
   Both default to today.
   Change only the transaction date when you are back-keying a document into a closed accounting month.
7. Enter the **Amount** before tax.
8. On a foreign-currency account, check the **Exchange rate**.
   It defaults from the Exchange Rates table at the document date and shows the approximate base-currency value underneath.
9. Add a **Description** if useful.
10. If the Analysis Dimensions section appears, pick a value for each dimension that matters; dimensions marked with a star are compulsory.
    Choosing a child value fills in its parent automatically, and changing the parent clears a child that no longer belongs under it.
11. Click **Save** to keep the invoice as an Open draft, or **Post invoice** / **Submit for Approval** to make it financial straight away.

Save gives you an editable draft that does not touch the debtor's balance.
The button label tells you what Submit will do: **Post invoice** posts immediately, while **Submit for Approval** sends it into the company's approval chain and it posts automatically once approved.
If the submit step fails after the save, the invoice stays saved as Open and the dialog stays open so you can fix and retry.

### Edit an Open invoice

1. Find the invoice (use the search box or the status filter set to **Open**) and click **Edit**.
2. Change what you need.
   An automatically issued number cannot be changed; a manually keyed number can be corrected while the invoice is still Open.
3. Click **Save**, or **Post invoice** / **Submit for Approval** to submit it as well.

Only Open invoices can be edited, and only by their creator or a superior within the role's data scope.
If you leave without saving, the system asks whether to discard your changes or keep editing.

### Submit an Open invoice from the list

1. Open the ⋮ menu on the invoice and click **Submit**.
2. Read the confirmation.
   It names the invoice, the debtor and the amount, and states exactly what will happen: the number is issued now and the amount hits the debtor's balance, or the invoice goes into the approval chain and posts automatically once approved.
3. Click **Post invoice** or **Submit for Approval**.

### Void an Open invoice

[Screenshot: Confirm void dialog with the Void reason field]

1. Open the ⋮ menu and click **Void**.
2. Enter the **Void reason**.
   It is compulsory and is kept for audit.
3. Click **Void**.

The draft never posted, so nothing reverses.
The number stays consumed and the record remains in the list as Void with your reason, so the auditor can explain the gap in the sequence.
A posted invoice cannot be voided; correct it with a Credit Note instead.

### Raise a Credit Note against a posted invoice

1. Open the ⋮ menu on a posted invoice and click **Raise Credit Note**.
2. The Credit Note dialog opens with the debtor preset, the invoice locked as the document to apply against, the amount seeded with the invoice's remaining balance, and the invoice's analysis dimensions copied.
3. Adjust the amount if you are only crediting part of it, then save or submit as for any credit note.

This action appears only when your role may create credit notes.
It is refused with a message when the invoice is already fully allocated, because there is no balance left to offset.

### See how a posted invoice was settled

1. Open the ⋮ menu on a posted invoice and click **Allocations**.
2. The viewer lists each receipt or credit note that settled it ("Settled by Official Receipt OR-000012 150.00") and, on a foreign-currency account, the realised exchange gain or loss on each allocation.

If nothing has been applied yet the viewer says so.

## Field reference

### Debtor picker

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search debtors** | No | Part of the account number, name or code. | Only active debtor accounts are listed. |

### New / Edit Invoice

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Invoice no.** | Only with manual numbering | The invoice number, when your company keys numbers by hand. | Up to 30 characters; must not already be in use. With automatic numbering the number is issued on save and cannot be changed. |
| **Transaction type** | Yes | The billing item, for example `OTH - Miscellaneous Fee`. Its tax scheme decides the tax added. | Invoice-class, active items only. |
| **Document date** | Yes | The date the invoice is raised, picked from the calendar. Drives the due date and aging. | Defaults to today. |
| **Transaction date (period)** | Yes | The accounting period the invoice belongs to. | Defaults to the document date; change it only when back-keying into a closed month. |
| **Amount** | Yes | The amount before tax, for example `250.00`. | Greater than zero; always shown with two decimals. Tax from the transaction type's scheme is added on top. |
| **Exchange rate** | Yes, on a foreign-currency account | How many units of the base currency one unit of the account currency is worth. | Only shown on foreign-currency accounts. A positive decimal with at most 10 decimal places; defaults from Exchange Rates at the document date; frozen once posted. |
| **Description** | No | Free text printed on statements, for example `Locker rental Q3`. | |
| **Analysis Dimensions** (one picker per dimension) | Yes for dimensions marked with a star | The reporting value for each dimension your company analyses by. | Values come from Analysis Setup; a child's choices narrow to the chosen parent. |

### Confirm void

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Void reason** | Yes | Why the draft is being voided, for example `keyed against the wrong debtor`. | Up to 255 characters; kept for audit. |

## Tips & troubleshooting

- **"Amount must be greater than zero."**
  Enter a positive amount.
- **"Select a transaction type." / "This transaction type is not a Invoice-class item."**
  Pick an active Invoice-class item from the list.
- **"Invoice number is required (numbering is manual)."**
  Your company keys invoice numbers by hand; enter one before saving or submitting.
- **"Invoice number 'X' is already in use."**
  Another invoice carries that number; pick a different one.
- **"No USD exchange rate is effective on the document date - add one under Exchange Rates or key the rate on the document."**
  The account is in a foreign currency and no rate covers the document date; add a rate or type one in the dialog.
- **"Tax scheme 'X' could not be resolved for this company."**
  The transaction type points at a tax scheme your company cannot use; fix the item under Transaction Type.
- **"Credit limit exceeded for this debtor." / "Personal credit limit exceeded for this member."**
  Posting would take the account past its credit limit; the invoice stays Open until the limit is raised or the account is paid down.
- **"Only an Open (draft) invoice can be edited (this one is posted)."** and **"A posted invoice cannot be voided - raise a Credit Note to offset it."**
  Posted invoices are immutable; correct them with a Credit Note.
- **"This invoice is awaiting approval - it must be approved or rejected first."**
  An invoice in the approval chain cannot be voided or edited until the approver decides.
- **"This invoice belongs to another user (outside your data scope)."**
  Your role's data scope only lets you amend your own or your department's documents.
- **"A void reason is required (kept for audit)."**
  Fill in the reason before clicking Void.
- **"X is already fully allocated - there is no balance left to offset with a Credit Note."**
  The invoice has been fully settled; nothing remains to credit.
- Use the Transaction date (period) only for genuine back-dating into a closed month; day to day, leave it equal to the document date.

## Related options

- **Account Receivable → Debtors** - the account-first view of the same documents, where invoices can also be keyed with the debtor preset.
- **Account Receivable → Credit Notes** - the correction document for a posted invoice.
- **Account Receivable → Official Receipts** - receipts settle posted invoices oldest first.
- **Account Receivable → Transaction Type** - the Invoice-class billing items and their tax schemes.
- **Account Receivable → Numbering Control** - automatic or manual invoice numbering.
- **Account Receivable → Analysis Setup** - the dimensions offered in the entry dialog.
- **Account Receivable → Exchange Rates** - the default rate on foreign-currency accounts.
