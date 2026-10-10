# Billing Schedules

> **Where:** Membership Management → Billing Schedules
>
> **Who can use it:** users whose role includes the Membership Management module (the menu is commonly granted to the finance team as well).
> Your role's Create and Edit permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

Billing Schedules is where the club raises its recurring membership charges for a month.
There are two kinds of run: the **Membership Fee** run bills each membership its assigned Membership Fee, and the **Subscription Fee** run bills the Standing charges of each member's type according to the status they hold.
A run first produces a **holding list** - one item per charge with the amount and which account it will post to - so staff can review it, skip what should not bill, and then post the selection.
Every posted item becomes one Invoice on the member's account in Account Receivable.
Staff come here once a month, type by type, and return to post items that were held back.

## The screen at a glance

[Screenshot: Billing Schedules list with the Generate a month card]

- A collapsible **Generate a month** card at the top (shown when you may create runs) with **Billing type**, **Month**, **Document date**, **Transaction date (period)** and a **Generate** button.
- A **Month** picker above the list filters the schedules shown; it starts on the current month.
- Each schedule is a card: the billing type as the title, then the item count, the net total and the document date.
- A status chip top-right reads **pending**, **partially-posted**, **posted** or **cancelled**.
- Each card has a **Review** button and, while pending, a ⋮ menu holding **Cancel**.

### The review screen

[Screenshot: Billing Schedule review]

- The title names the billing type and the month, with a **Back to Billing Schedules** link.
- A summary strip shows the status, item count, net total, document date and the period date when it differs.
- A toolbar with **Select all pending** and a **Post N Invoice(s) - amount** button that states exactly what will post.
- One row per item: a tick box (pending items only), the description, the target account (**Membership debtor** or **Nominee debtor**), the invoice number once posted, any issue in red, the amount and a status chip (**pending**, **posted**, **skipped** or **failed**).
- Pending rows carry a red **Skip** button; skipped rows a green **Restore** button.

## Common tasks

### Generate a month's run

1. Expand **Generate a month** if it is folded.
2. Pick the **Billing type** - Membership Fee or Subscription Fee.
3. Pick the **Month**; the **Document date** and **Transaction date (period)** fill with the last day of that month and can be changed.
4. Click **Generate**.

The system confirms "N item(s) generated - total X." and lists any warnings - memberships that were skipped and why (for example "M-0012: no membership fee assigned").
The new schedule appears in the list for that month with status **pending**.
Only one schedule per billing type per month can exist unless the earlier one was cancelled.

What each run picks up:

- **Membership Fee**: every membership whose status is of class Active or Active (Absent) and that has **Monthly fee** ticked, or **Yearly fee** ticked and its join-date anniversary in this month; the amount is the assigned Membership Fee's amount and it posts to the membership's account.
- **Subscription Fee**: for each individual member and nominee, the Standing charges of their type that name the exact status they hold and fall due this month (Monthly every month, Fixed Month in that month, Annually in the join-date anniversary month); a corporate membership's own standing charges are raised too.
  An individual member's charges post to the membership account; a nominee's post to the membership account or the nominee's own account according to who bears the subscription.
  Dependents never bill.

### Review and post a schedule

1. Click **Review** on the schedule.
2. Read the items; click **Skip** on any that should not bill this month (a skipped item can be brought back with **Restore**).
3. Tick the items to post, or tick **Select all pending**.
4. Click **Post N Invoice(s) - amount**.

The system posts one Invoice per item, shows the invoice number on each posted row and reports "N Invoice(s) posted" (with the count that failed, if any).
A failed item stays on the list with its reason in red and can be posted again once the cause is fixed.
Posted items are never changed here; corrections are made in Account Receivable.

### Cancel a schedule

- Open the pending schedule's ⋮ menu and click **Cancel**.
  This is possible only while nothing has posted; afterwards the Invoices are voided in Account Receivable instead.
  After cancelling, the month can be generated again.

### Find last month's run

- Change the **Month** picker above the list.

## Field reference

### Generate a month

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Billing type** | Yes | **Membership Fee** or **Subscription Fee**. | One schedule per type per month (cancelled runs excepted). |
| **Month** | Yes | The month being billed, picked from the list (newest first). | - |
| **Document date** | Yes | The invoice date printed on the posted Invoices; defaults to the last day of the month. | A valid date. |
| **Transaction date (period)** | Yes | The period date the Invoices are booked to; defaults to the document date. | A valid date. |

### Review screen

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Select all pending** / item tick boxes | No | Which pending items to post. | At least one to post. |

## Tips & troubleshooting

- If you see "Membership integration is switched off in AR Specification - fee and standing-charge runs cannot post to AR." ask the finance team to enable Membership integration on the Account Receivable Specification; without it fees are collected at the front desk.
- If you see "A membership-fee schedule for this month already exists (pending)." (or subscription-fee) open the existing schedule from the list, or cancel it first.
- If a generation warning says "no membership fee assigned", "membership fee not found or disabled" or "fee 'X' has no AR transaction type set (Membership Fee master)", fix the membership or the fee and generate again after cancelling the run.
- If a warning says "transaction type 'X' not found or disabled", the standing charge points at a billing item that is no longer opened to Membership; fix it on Account Receivable → Transaction Type.
- If an item fails with "Transaction type not found (or not opened to Membership)." or "Tax scheme 'X' could not be resolved.", correct the catalog entry or its tax scheme and post the item again.
- If you see "Items have already posted - void the Invoices in AR instead of cancelling the schedule." the run is partly posted and cannot be cancelled.
- If you see "Only pending items can be skipped (and un-skipped)." the item has already posted or failed.
- If you see "Select at least one item to post." tick an item first.
- A membership with neither **Monthly fee** nor **Yearly fee** ticked is never picked up by the Membership Fee run - its fee is billed at joining instead.
- Generate the Membership Fee and Subscription Fee runs separately each month; they are independent schedules.

## Related options

- Membership Management → Membership Fee - the fee amounts and the billing item each fee posts under.
- Membership Management → Membership Type → Standing charges - the status-based recurring charges the Subscription Fee run raises.
- Membership Management → Memberships - the Monthly fee / Yearly fee flags and the assigned fee on each membership.
- Membership Management → Membership Status - the status classes that count as active for the Membership Fee run.
- Account Receivable → Specification - the Membership integration switch.
- Account Receivable → Transaction Type - the billing items and their tax schemes.
- Account Receivable → Debtors - the member accounts the Invoices post to.
