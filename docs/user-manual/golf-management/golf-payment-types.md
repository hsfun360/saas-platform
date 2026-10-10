# Payment Type

> **Where:** Golf Management → Payment Type
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New, Edit and Enable/Disable controls appear only when your role holds the matching Create or Edit permission for this screen.

## What this option is for

The Payment Type screen maintains the club's list of settlement tenders - the ways a golf bill can be paid at the front desk, such as Cash, Visa Card, Member Account or Voucher.
Every payment type carries a **payment class** that tells the system what actually happens when the tender is used: a cash-like class simply records the money, the Member class charges the bill to the member's account, the Debtor class charges a group booking's billing party, and the Deposit class applies a deposit the club already holds.
Staff come here once when setting up golf billing, and again whenever the club starts accepting a new kind of payment or retires an old one.
The payment types defined here are the tiles the cashier picks from when settling a bill on the Tee Time Sheet and when recording deposits or the final bill of a group booking.

## The screen at a glance

[Screenshot: Payment Type list]

- A count line shows how many payment types exist and how many are active.
- A search box filters the list as you type; it matches the payment type code, the description and the class name.
- Each payment type is a card showing its icon (if one was uploaded), the code as the title, a chip with the payment class, and the description.
- A status chip at the top right shows **Active** or **Disabled**; active types are listed first.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New payment type** button floats at the bottom right of the screen.

## Common tasks

### Add a new payment type

[Screenshot: New payment type dialog]

1. Click **New payment type**.
2. Enter the **Payment Type** code (e.g. `VISA`) and pick the **Payment Class** that describes how the money arrives (see the field reference for what each class does).
3. Optionally add a **Description** (e.g. `Visa Card`).
4. Optionally click **Upload icon** and choose a picture; it becomes the tender tile the cashier sees.
5. Click **Save**.

The new payment type appears in the list as Active and is offered immediately on the settlement screens.

### Edit a payment type

1. Find the payment type (use the search box if the list is long) and click **Edit**.
2. Change what you need.
   Changing the class changes how future settlements with this tender behave; bills already settled are not touched.
3. Use **Replace icon** or **Remove** to change the picture.
4. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a payment type

- Open the card's ⋮ menu and click **Disable** to retire a tender the club no longer accepts.
  It stays on this screen marked **Disabled** for history, but the cashier can no longer pick it.
- Open the ⋮ menu and click **Enable** to bring it back.
- There is no delete: a tender that has been used on bills keeps its history.

## Field reference

### New / Edit payment type dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Payment Type** | Yes | A short code for the tender as the cashier will see it on the tile, e.g. `CASH` or `VISA`. | Up to 50 characters; must be unique in your company. |
| **Payment Class** | Yes | What happens when this tender is used. **Cash**, **Credit Card**, **Voucher**, **Staff** and **Online** record the money received. **Member** charges the bill to the billed member's account as an Account Receivable invoice. **Debtor** charges the billing party of a group booking (a travel agent, society or corporate account). **Deposit** applies a deposit the club already holds to a group booking's final bill. **Suspend** parks the amount. | Pick one of the fixed choices. |
| **Description** | No | A fuller name, e.g. `Visa Card`. | Up to 255 characters. |
| **Icon** | No | A picture for the tender tile on the front-desk settlement screen; square images look best. | Image files up to 2 MB. Upload, replace or remove; the change is kept only when you click Save. |

## Tips & troubleshooting

- If you see "Payment type 'X' already exists." another payment type in your company already uses that code; pick a different code.
- If you see "Payment type is required." or "Select a valid payment class." the code box is empty or no class was picked.
- If you see "Payment type must be 50 characters or fewer." shorten the code.
- If you see "Your role's data scope does not allow amending this record." the payment type was created by someone outside your data scope; ask the record's owner or an administrator.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- If an icon upload fails with "No image file uploaded." choose an image file and try again.
- Keep one payment type per real-world tender rather than one per card brand you do not need to report on separately; the class, not the code, drives the behaviour.
- A Member-class tender only works for a bill whose player is a member whose status allows charging to account; the front desk tells you when the member is barred.
- The Debtor class is used on the group booking folio (deposits and the final bill); on a golfer's own bill at the Tee Time Sheet it is not yet accepted and the system says so.

## Related options

- Golf Management → Front Desk → Tee Time Sheet - where bills are settled with these tenders.
- Golf Management → Group Bookings - deposits and the final group bill are recorded with these tenders; the Deposit class applies a held deposit.
- Golf Management → Transaction Type - the billing items that appear on a bill (the other half of the front-desk tiles).
- Account Receivable → Transaction Type - the invoice type opened to Golf that Member and Debtor settlements post with.
