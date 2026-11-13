# Payment Types

> **Where:** Facility Management → Payment Types
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New payment type button needs the Create permission for this screen; Edit and Enable/Disable need the Edit permission.

## What this option is for

The Payment Types screen maintains the club's list of tenders - the ways a facility bill can be settled at the desk, such as cash, a card, a charge to the member's account or a voucher.
Every payment type carries a **payment class** that tells the system what happens when the tender is used: most classes simply record the tender on the bill, the Member class charges the amount to the billed member's own account, and the Debtor class charges an Other Debtor picked at settlement.
Staff come here once when setting up facility billing, and again whenever the club starts accepting a new kind of payment or retires an old one.
The active payment types are the tenders offered when a facility bill is settled - the bill of a booking, and the bills raised at the Control Station, which open on the Facility Bookings screen to be settled.
A bill cannot be settled until at least one payment type exists.

## The screen at a glance

[Screenshot: Payment Types list]

- A count line shows how many payment types exist and how many are active.
  Before the first one is added it reads "No payment types yet. Use 'New payment type' to add the first tender - a bill cannot be settled without one."
- A search box filters the list as you type; it matches the payment type code, the description and the class name.
  When nothing matches, the screen says so and offers a **Clear search** button.
- Each payment type is a card showing its icon (or a standard payment symbol when none was uploaded), the code as the title, a chip with the payment class, and the description.
- A status chip at the top right shows **Active** or **Disabled**; active types are listed first, then in code order.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
  A card shows no buttons when the record lies outside your role's data scope.
- The **New payment type** button floats at the bottom right of the screen.

## Common tasks

### Add a new payment type

[Screenshot: New payment type dialog]

1. Click **New payment type**.
2. Enter the **Payment Type** code (e.g. `CASH`); it is stored in capitals and is the label on the settlement tile.
3. Pick the **Payment Class**; a line under the field explains what the class does at settlement.
4. Optionally add a **Description** (e.g. `Visa card`).
5. Optionally click **Upload icon** and choose a picture; it is shown on the settlement tiles.
6. Click **Save**.

The new payment type appears in the list as Active and is offered the next time a bill is settled.

### Edit a payment type

1. Find the payment type (use the search box if the list is long) and click **Edit**.
2. Change what you need.
3. Use **Replace icon** or **Remove** to change the picture.
4. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a payment type

- Open the card's ⋮ menu and click **Disable** to retire a tender the club no longer accepts.
  It stays on this screen marked **Disabled**, but it is no longer offered when a bill is settled.
- Open the ⋮ menu and click **Enable** to bring it back.
- There is no delete on this screen: retire a tender by disabling it.

## Field reference

### New / Edit payment type dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Payment Type** | Yes | A short code for the tender, e.g. `CASH` or `VISA`; it is the label on the settlement tile. | Up to 50 characters; stored in capitals; must be unique in your company. |
| **Payment Class** | Yes | What happens when this tender is used. **Cash**, **Credit Card**, **Voucher**, **Staff** and **Online** record the tender on the bill; nothing is posted to a ledger account. **Member** charges the amount to the billed member's own account through Account Receivable, with the credit limit enforced. **Debtor** charges the amount to an Account Receivable Other Debtor picked at settlement (a corporate account, a city ledger). **Suspend** counts toward settlement and flags the bill for later suspense clearing. | Pick one of the eight choices. |
| **Description** | No | A fuller name, e.g. `Visa card`. | Up to 255 characters. |
| **Icon** | No | A picture for the tender on the settlement tiles; square images look best. | Image files up to 2 MB. Upload, replace or remove; the change is kept only when you click Save. |

## Tips & troubleshooting

- If you see "Payment type 'X' already exists." another payment type in your company already uses that code; pick a different code.
- If you see "Payment type is required." or "Select the payment class." the code box is empty or no class was picked.
- If you see "Use 50 characters or fewer." or "Payment type must be 50 characters or fewer." shorten the code.
- If you see "Select a valid payment class." pick the class again from the list.
- If you see "No image file uploaded." choose an image file and try again.
- If an icon will not upload, check that it is an image and no larger than 2 MB.
- If you see "Your role's data scope does not allow amending this record." the payment type was created by someone outside your data scope; ask the record's owner or an administrator.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- The class, not the code, drives the behaviour: keep one payment type per tender you need to tell apart at settlement.
- The Member and Debtor classes post the charge to Account Receivable, so exactly one Account Receivable invoice transaction type must be opened to the Facility module.
  Until then a settlement with either class is refused with "Open an AR invoice transaction type to the Facility module first (AR - Transaction Type)." or, when more than one is opened, "Several AR transaction types are opened to Facility - keep exactly one so charges post unambiguously."
- A Member-class tender needs a bill whose booker is a member; otherwise the settlement answers "Charge to member account needs a member booker."
- A Debtor-class tender asks for the Other Debtor to charge when the bill is settled.

## Related options

- Facility Management → Facility Bookings - where a booking's bill is opened and settled with these tenders.
- Facility Management → Control Station - raises bills for entries and paid Utility Items; opening one takes you to Facility Bookings to settle it with these tenders.
- Facility Management → Transaction Types - the billing items that appear on a bill.
- Account Receivable → Transaction Type - the invoice type opened to Facility that Member and Debtor settlements post with.
- Account Receivable → Debtor Listing - where the Other Debtors a Debtor-class tender can charge are maintained.
