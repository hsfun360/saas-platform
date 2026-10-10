# Transaction Type (Membership view)

> **Where:** Membership Management → Transaction Type
>
> **Who can use it:** users whose role includes the Membership Management module.

## What this option is for

This screen is a read-only view of the billing-item catalog entries that have been opened to the Membership module.
The catalog itself - every transaction type with its class, description and tax scheme - is maintained under Account Receivable → Transaction Type, where each entry is ticked for the modules allowed to use it.
Membership staff come here to check which items are available to them when picking a fee's billing item, a joining fee or a standing charge, and to see each item's tax scheme without needing access to the Account Receivable screens.
Nothing can be added, edited, enabled or disabled here.

## The screen at a glance

[Screenshot: Transaction Type (Membership view) list]

- A note line reads "Read-only - maintained on Account Receivable → Transaction Type." followed by a count, e.g. "12 entries opened to Membership, 11 active."
- A search box filters the list as you type, matching the code and description.
- Each entry is a card: the transaction type code as the title, a chip with its class (Invoice, Debit Note, Credit Note, Interest, Deposit, Receipt or Forex), the description, and the tax scheme when one is set.
- A status chip top-right shows **Active** or **Disabled**; active entries are listed first.
- There are no Edit buttons, no ⋮ menus and no New button.

## Common tasks

### Check whether a billing item is available to Membership

1. Type part of the code or description in the search box.
2. If the item appears with an **Active** chip, it can be picked on the Membership Fee, Joining fees and Standing charges dialogs (subject to the class each dialog needs).
3. If it is missing, ask the Account Receivable team to tick **Membership** under the entry's usable modules on Account Receivable → Transaction Type.

### Find an item's tax scheme

- The **Tax scheme** line on the card shows the scheme the item carries; joining fees and standing charges take their tax from this item, so this is where to confirm it.

## Field reference

This screen has no form; the search box is the only input.

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Search** | No | Any part of a transaction type code or description. | Filters the loaded list only. |

## Tips & troubleshooting

- If the list is empty with the message "No catalog entries are opened to Membership yet - tick 'Membership' on the entries under Account Receivable → Transaction Type.", no billing item has been opened to Membership; this must be done on the Account Receivable master.
- If you see "Select a workspace first." pick a company in the header before using this screen.
- A **Disabled** entry is shown for completeness but cannot be picked on any Membership dialog; re-enable it on the Account Receivable master if it is still needed.
- Membership fees need an **Invoice**-class item; joining fees and standing charges also pick from this list.

## Related options

- Account Receivable → Transaction Type - where the catalog is maintained and entries are opened to Membership.
- Membership Management → Membership Fee - picks an Invoice-class item as the fee's billing item.
- Membership Management → Membership Type → Joining fees / Standing charges - pick their billing items from this catalog.
