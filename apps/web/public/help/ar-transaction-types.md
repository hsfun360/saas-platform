# Transaction Type

> **Where:** Account Receivable → Transaction Type
>
> **Who can use it:** users whose role includes the Account Receivable module and holds this menu.
> The Create permission is needed for **New transaction type** and **Copy from company**; the Edit permission for **Edit** and **Enable** / **Disable**.

## What this option is for

The Transaction Type master is the Account Receivable catalog of billing items and payment methods.
Every entry belongs to one document class, which decides where it can be used:

- **Invoice**, **Debit Note** and **Credit Note** entries are the items staff pick when keying those documents; each carries the tax scheme that decides the tax added.
- **Interest** entries are what the interest run posts under, and **Deposit** entries bill security deposits.
- **Receipt** entries are the ways money comes in (cash, cheque, card) and **Refund** entries the ways money goes out; they carry no tax.
- **Forex** entries classify realised exchange gains and losses.

An Invoice-class entry can also be opened to one producer module, such as Membership, so that module's automatic runs can post charges with it.
Entries are never deleted, because documents refer to them; disable the ones you no longer use.

## The screen at a glance

[Screenshot: Transaction Type list with the count line, Copy from company, search and entry cards]

- A count line reads "12 transaction types, 11 active", with **Copy from company** beside it.
- A search box filters by code, description or class as you type.
- Each entry is a card: the code as the title; a sub-line with the class chip, a chip per module it is opened to, an "e-Invoice" chip with the classification code when relevant, and the description; then the Tax scheme when one is set.
  Active entries list first, then by class and code.
- The status chip sits top-right: **Active** or **Disabled**.
- Each row has **Edit** and a ⋮ menu holding **Enable** or **Disable**.
- **New transaction type** sits bottom-right.

## Common tasks

### Add a billing item or payment method

[Screenshot: New transaction type dialog at the class picker step]

1. Click **New transaction type**.
2. Pick the document class.
   Each option states its consequence, for example "Receipt - methods of collecting debtor payments".
   The class decides which fields the form shows.

[Screenshot: New transaction type form for an Invoice-class entry]

3. The form opens with **Transaction Class** fixed; **Change** returns to the picker.
4. Enter the **Transaction Type** code, for example `OTH`, and a **Description** such as `Miscellaneous Fee`.
5. For billing classes, pick the **Tax Scheme**, or leave it as None for a tax-free item.
   Receipt and Refund entries never show this field, because payment methods levy no tax.
6. For an Invoice-class entry, choose under **Usable by module** whether the item is AR internal only or opened to one producer module.
   Only modules your company subscribes to are offered.
7. For billing classes, tick **Charge late-payment interest on overdue items** if overdue documents using this item should attract interest.
8. For Malaysian companies, tick **e-Invoice relevant (LHDN MyInvois)** and pick the **Classification code** when the item must be reported to LHDN.
9. Click **Save**.

The entry is available in its class's pickers immediately.

### Edit an entry

1. Find the entry and click **Edit**.
2. Change what you need.
   The class is fixed; to move an item to another class, disable it and create a new one.
3. Click **Save**.

If you leave without saving, the system asks whether to discard your changes or keep editing.

### Disable or enable an entry

- Open the ⋮ menu and click **Disable** to retire an entry.
  It disappears from every picker; documents already using it are unchanged.
- Click **Enable** to bring it back.

### Copy entries from another company

[Screenshot: Copy from company dialog at the selection step]

1. Click **Copy from company** and pick the company.
   Only companies you have access to are listed.
2. The next step previews the source's active entries.
   Codes that already exist here are marked "Already exists here - will be skipped" and cannot be selected; new ones are pre-selected.
   Each row also notes any adaptation: a tax scheme not available here copies without it, module usability your company is not subscribed to is dropped, and e-Invoice settings are dropped for non-Malaysian companies.
3. Untick anything you do not want, then click **Copy N transaction type(s)**.

The result reports how many were created and skipped.
Existing entries are never overwritten.

## Field reference

### Class picker

| Choice | What it is for |
| --- | --- |
| **Invoice** | Bills charges to the debtor's account. |
| **Debit Note** | An adjustment that increases what the debtor owes. |
| **Credit Note** | An adjustment that reduces what the debtor owes. |
| **Interest** | Late-payment interest posted by the monthly interest run. |
| **Deposit** | Security deposits held as collateral. |
| **Receipt** | Methods of collecting debtor payments. |
| **Refund** | Methods of paying money back to the debtor. |
| **Forex** | Exchange-rate gain or loss entries. |

### New / Edit transaction type

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Transaction Class** | Yes | The class chosen in the picker; shown read-only. | **Change** is available only while creating. |
| **Transaction Type** | Yes | A short code staff recognise, for example `OTH` or `CASH`. | Up to 50 characters; must be unique within the company. |
| **Description** | No | The fuller wording, for example `Miscellaneous Fee`. | Up to 255 characters. |
| **Tax Scheme** | No | The tax applied when this item is billed; None for a tax-free item. | Billing classes only. Must be a scheme your company can use, and not an input-tax scheme. |
| **Usable by module** | No | "None - AR internal only", or the one producer module that may post with this entry. | Invoice class only; one module at most; only subscribed modules are offered. |
| **Charge late-payment interest on overdue items** | No | Tick so the interest run considers overdue documents of this item. | Billing classes only. |
| **e-Invoice relevant (LHDN MyInvois)** | No | Tick when the item must be reported to LHDN. | Malaysian companies and billing classes only. |
| **Classification code** | Yes when e-Invoice relevant is ticked | The LHDN classification code, snapshotted onto document lines. | From the e-Invoice Classifications list. |

## Tips & troubleshooting

- **"Transaction type is required."** and **"Transaction type must be 50 characters or fewer."**
  Enter a code within the limit.
- **"Transaction type 'X' already exists."**
  Codes are unique within the company; pick another.
- **"Tax scheme not found for this company (or is an INPUT scheme)."**
  Choose a scheme from the list; purchase-side schemes cannot be used for debtor billing.
- **"An entry can be usable by one module only - pick a single module."** and **"Your workspace is not subscribed to: golf."**
  One module at most, and only subscribed ones.
- **"Membership still references this type in 3 fee/standing-charge setups - repoint those first."**
  Removing Membership usability would break the next fee run; change the fee or standing charge setups to another type first.
- **"An e-Invoice classification code is required when the item is e-Invoice relevant."** and **"e-Invoice classification 'X' is not in the LHDN list (sync it under e-Invoice Classifications)."**
  Pick a code from the synced LHDN list.
- **"Your role's data scope does not allow amending this record."**
  Your role can only amend entries created by you or your department.
- **"You have access to no other company to copy from."**
  Copying needs a second company in which you hold an active membership.
- An entry dialog that says "No Receipt-class entries yet" or "No Refund-class entries yet" means the matching payment methods have not been created here.
- The Golf no-show charge needs exactly one Invoice-class entry opened to Golf; with none or several, those charges cannot post.

## Related options

- **Account Receivable → Invoices**, **Debit Notes**, **Credit Notes**, **Official Receipts**, **Refunds** and **Deposits** - the entry dialogs that offer entries of their own class.
- **Account Receivable → AR Specification** - designates the Interest, Credit Note and Forex-class entries used by the interest run, deposit conversions and exchange differences.
- **Account Receivable → Interest Generation** - charges interest only on documents whose item has the interest flag.
- **System Setup → Tax Setup** - the tax schemes offered here.
- **System Setup → e-Invoice Classifications** - the LHDN classification list.
- **Membership Management → Membership Fee** - picks Invoice-class entries opened to Membership.
