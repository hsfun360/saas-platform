# Group Bookings

> **Where:** Golf Management → Group Bookings
>
> **Who can use it:** users whose role includes the Golf Management module and holds this menu.

## What this option is for

A group booking is a tournament, a corporate day, a society outing or a travel agent's package group: one organiser, many players, one or more play days, and one bill for the whole group.
This screen is the group's folio from the first enquiry to the last refund.
On it you set up the play days and their start formats, hold the tee sheet by reserving flights, key the player roster, draw the players into flights, bill the packages and charges, print the proforma invoice that demands the deposit, record the deposits as they arrive, settle the final bill, and ask Finance to refund any deposit money the booking no longer needs.
Registering the players on the day and billing each player's own extras happen on the Tee Time Sheet.

The deposit flow is deliberately simple for Finance: a deposit is a golf bill, never a deposit document in Account Receivable.
Account Receivable only ever sees normal invoices from golf: one when a deposit is charged to the organiser's account, and one for the balance when the final bill is charged to it.

### Two ways a club runs group bookings

How a booking moves from enquiry to confirmed depends on **Enable group booking control** under Golf Specification → Group Bookings.

- **Control off** (a committee club keying its own Monthly Medal): a new booking is **Confirmed** the moment it is created, nothing expires, nothing needs approval, and no deposit deadline runs.
- **Control on** (a club whose sales team sells group days): a new booking is **Tentative**.
  Its reserved flights hold the tee sheet only for the tentative hold period; submit it for approval before that runs out or the flights are released.
  Once submitted it is **Pending approval** and frozen; the approvers decide from the share of the tee sheet it takes and the charges on its bill.
  Approval makes it **Approved** and starts the deposit clock; the booking becomes **Confirmed** when the deposit is in, or **Lapsed** when the pay-by date passes without it.
  Players are drawn into flights, registered and settled only once the booking is Confirmed.

The status chip on every card and page tells you where a booking stands, and the line under the booking's name says what happens next and when.

## The screen at a glance

[Screenshot: Group Bookings list]

- Two date fields filter by play dates; the range reaches 31 days back and 180 days ahead.
- A **Status** filter narrows to one state (Tentative, Pending approval, Approved, Confirmed, Lapsed or Cancelled); a search box filters the loaded list by group name, booking number, organiser or course.
- Each booking is a card: the group name as the title, a **Group** or **Tournament** chip, the booking number, the play dates and courses, then the organiser, the number of days and the roster count against the expected players.
  With group booking control on, a line such as "Hold expires 14 Oct, 09:00" or "Deposit 3,000.00 due 18 Oct, 23:59" shows the clock that is running.
- **Open** goes to the booking's own page; the ⋮ menu holds **Cancel booking**.
- **New group booking** sits bottom-right.

[Screenshot: Group booking page with its section cards]

The booking's page is a stack of collapsible section cards:

1. **Header** - the status chip, the lifecycle line, then name, type, organiser and billing party, contact, expected players and remarks.
   The visible button is the booking's next step (**Submit for approval**, or **Recall from approval** while it is pending; **Confirm booking** when control is off), and the ⋮ menu holds **Edit details**, **Extend deposit deadline**, **Reopen** and **Cancel booking** as the state allows.
2. **Play days & flights** - one block per play day with its course, start format and window, the reserved flights as tiles, and **Reserve flights**.
3. **Roster** - one row per person for the whole booking, with **Add players**.
4. **Flight draw** - a play-day picker and one flight select per listed player, with **Fill in roster order**, **Clear** and **Save draw**.
5. **Group bill & proforma** - the packages and charges, the proforma terms, **Issue proforma**, and the **Final bill** block with **Settle**.
6. **Deposits** - one card per deposit bill with its standing, and **Record deposit**.
7. **Refund requests** - the requests sent to Finance, with **Record payout**, **Decline** and **Request refund of held deposit**.

## Common tasks

### Create a group booking

[Screenshot: New group booking drawer]

1. Click **New group booking**.
2. Pick **Group** or **Tournament**, key the **Group / tournament name**.
3. Pick the **Organiser**: a **City ledger account** (a travel agent, society or corporate that Finance opened under Account Receivable → Other Debtors), a **Member** by member number, or **No account** for a cash-only organiser.
4. Key the contact person, mobile and the expected number of players.
5. Add one **Play day** line per date: the date, course, holes, **Start format**, and the first tee time.
   A **Shotgun** or **Modified shotgun** day also takes the time the course is **held until**, the number of waves, and for a modified shotgun the start holes.
   Use **Add another day** for a second date, which may be on a different course.
6. Click **Save**.

The booking opens on its own page.
Nothing is held on the tee sheet yet: that happens when you reserve the flights.

### Reserve the flights

[Screenshot: Reserve flights dialog with the seat preview]

1. On the play day, click **Reserve flights**.
2. For a **Traditional** or **Two-tee start** day, key the number of flights and the players per flight.
   The flights take consecutive tee times from the day's first tee time, on one nine or alternating both.
3. For a **Shotgun** or **Modified shotgun** day, key the holes that take two flights (A and B, usually the par 5s), the players per flight and, with more than one wave, the gap between waves.
4. Read the preview line, for example "22 flight(s) · 88 seats", and click **Reserve**.

Reserved flights hold the tee sheet at once.
A traditional or two-tee flight holds its tee-time cell at full capacity, crossover included, and the tee sheet shows its seats as reserved for the group.
A shotgun day holds both nines of the course for the whole window, and the tee sheet reads "HELD · <group>" on every row inside it.
Reserving again replaces the day's flights; it is refused while players are drawn into them.

The dialog also states what other groups already hold of that course's tee times on the day, the share cap that applies, and the share after this reservation.
Management sets the caps under Golf Specification → Group Bookings; a reservation that would push all groups past the cap is refused with the numbers, and a club event is exempt.
With the tentative-bookings-per-user cap on, you may hold only that many tentative bookings with reserved flights at a time - submit one or release its flights before reserving more.

With group booking control on, the tee sheet names the state as well ("TENTATIVE · <group>", "PENDING · <group>", "APPROVED · <group>") until the booking is confirmed.
A tentative booking's flights are held only for the tentative hold period set in Golf Specification; reserving again restarts that clock, and the lifecycle line on the header shows when it runs out.
If it runs out before you submit, the flights are released, you receive a notification, and the booking stays tentative without flights - reserve them again when you are ready.

### Submit for approval

[Screenshot: Submit for approval dialog with the per-day shares and the approval steps]

Group booking control on only.

1. Reserve flights for every play day and key the group bill and the proforma terms (the approvers decide on them).
2. On the header, click **Submit for approval**.
3. Read the preview: for each play day the number of flights, the share of that day's tee times this booking takes, and the share all groups hold once it is in; the bill total, the price per player, any manually keyed prices, and the deposit demanded against what is already held; then the approval steps and who decides each one.
   The last line states the outcome: who it goes to, or that it is approved at once because no chain applies, and when the deposit falls due.
4. Click **Submit for approval** (or **Approve and demand deposit** / **Approve and confirm** when no chain applies).

While the booking is pending, its flights stay held and nothing on it can change; **Recall from approval** takes it back to tentative with everything kept.
When the approvers approve, the booking becomes Approved: the proforma can be issued, deposits recorded, and the deposit must be in by the pay-by date.
If a deposit is not needed (the proforma states 0.00, or the default deposit percentage is 0), approval confirms the booking at once.
When they reject it, the booking returns to tentative and its flights are released - amend the charges or the shape, reserve the flights again, and resubmit.
With control off, the same button reads **Confirm booking** and simply confirms a tentative booking.

### Extend the deposit deadline

1. On an Approved booking, open the ⋮ menu and click **Extend deposit deadline**.
2. Pick the new pay-by date (later than the current one) and give the reason.
3. Click **Extend to <date>**.

A deadline can be extended once per booking.
When the pay-by date passes with the deposit short, the booking lapses: its flights are released, the reason is recorded on the header, and whoever created it is notified.

### Reopen a booking

1. On an Approved, Confirmed or Lapsed booking, open the ⋮ menu and click **Reopen for amendment** (or **Reopen lapsed booking**).
2. Confirm.

The booking becomes tentative again so its days, flights and charges can change, and it must be submitted for approval once more.
Any deposit already held keeps its flights from expiring.
A lapsed booking reopens without flights - reserve them again.
A booking whose players are already registered can no longer be reopened.

### Key the roster

[Screenshot: Add players drawer]

1. In the Roster card, click **Add players**.
2. Key one row per person: **Member** or **Member as Guest** by member number, or **Guest** by name, with an optional handicap and team.
   Blank rows are ignored; use **Add row** for more.
3. Click **Save**.

Members are checked against the membership records as you save.
A player's row has a ⋮ menu with **Edit**, **Withdraw** and **Remove**; a withdrawn player leaves every flight they were only booked into, and a player who has already registered can only be withdrawn, never removed.

### Draw the players into flights

[Screenshot: Flight draw with the play-day picker and flight selects]

1. In the Flight draw card, pick the **Play day**.
2. Click **Fill in roster order** to place every listed player into the flights in order, or pick a flight for each player in their select.
   Each option shows the flight's live load, for example "1A · 07:30 · E1 (3/4)".
3. Click **Save draw for <date>**.

Saving writes the players onto the tee sheet.
A flight never takes more than its capacity, and a player who has already registered on that day shows locked and cannot be moved or taken out.
Each day is drawn on its own, so a player can be in different flights on different days.

### Bill the packages and charges

[Screenshot: Group bill card with items and the add-item line]

1. In the Group bill & proforma card, pick the **Billing item**, key the **Quantity** and click **Add item**.
   A package is billed per player, so key the number of players: the button reads "Add package × 24" and the package explodes into its element lines.
   An item that allows a manual price also offers a **Unit price**.
2. Change a quantity or an allowed price in the row, or remove a row with ✕; a package line removes its whole package.

The group bill is created with the first item and priced on the first play day.
It is open until it is settled as the final bill.

### Issue the proforma invoice

1. Key the **Deposit required** and the **Pay by** date, then click **Save terms**.
2. Click **Issue proforma**.

The proforma gets its number from the Proforma series and opens in a new tab for printing; **Open proforma** reopens it any time.
After a change to the items or terms, **Re-issue and print** keeps the number and raises the revision.

### Record a deposit

[Screenshot: Record deposit dialog with the outcome line]

1. In the Deposits card, click **Record deposit**.
2. Key the **Amount received** (it defaults to what the proforma still demands) and pick the **Payment type**.
3. Read the outcome line before you commit:
   - a cash-type tender ("…settled by CASH - the money is received now") raises a deposit bill settled at once;
   - a **City Ledger** or **Member** tender ("…charged to <organiser>'s account as a normal AR invoice") raises the same deposit bill and posts an invoice to the organiser's account.
4. Click **Record deposit**.

Each deposit is its own deposit bill with one Deposit item, printable from its card with **Print**.
An on-account deposit's card reads the live standing from Account Receivable each time the page opens: **Outstanding** with the amount still to collect, **Partially paid**, or **Paid** with the receipt number and date.
A cash deposit keyed in error can be voided from its ⋮ menu with a reason; an on-account deposit is on the ledger and is reversed by Finance.

### Settle the final bill

[Screenshot: Settle dialog with a deposit line and a balance line]

1. In the Final bill block, click **Settle <total>**.
2. The dialog opens with one **Deposit** line per held deposit already applied, oldest first.
   Use **Apply held deposits** to redo that, or ✕ to drop a line.
3. **Add payment** for the balance: any cash-type tender, or **City Ledger** / **Member** to charge the balance to the organiser's account.
4. Watch **Remaining** reach 0.00, read the outcome line, and click **Settle bill**.

Deposits are applied in golf; nothing moves in Account Receivable for them.
A City Ledger or Member line posts an invoice for that amount only, so the deposit invoice and the balance invoice together equal the package.
A settled bill lists its tender lines.

### Request a refund

[Screenshot: Request refund dialog]

1. In the Refund requests card, click **Request refund of held deposit**.
2. Key the **Amount** (it defaults to everything still held) and the **Reason**, then click **Send to Finance**.

The request reserves that money on the deposit bills, oldest first, so it can neither settle the final bill nor be requested twice.
Finance then clicks **Record payout** on the request and keys how it was paid (bank transfer, cheque, or **Credit note** for a deposit that was charged to account), or **Decline** with a reason, which releases the money back to the folio.
Golf never posts credit notes; the Account Receivable side of a refund is Finance's decision.

### Cancel a booking

1. On the card or the page, open the ⋮ menu and click **Cancel booking**.
2. Key the reason and confirm.

Every play day's hold is released and all booked players come off the tee sheet; registered players stay on record.
If the organiser owes a cancellation charge, add it to the group bill and settle it from the held deposit; the remainder is then requested as a refund.
The folio stays workable on a cancelled booking while its group bill is open; no new deposits can be recorded.

## Field reference

### Header

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Booking type** | Yes | Group or Tournament. | Display only; both work the same way. |
| **Group / tournament name** | Yes | The name as the organiser calls it. | Up to 150 characters; prints on the proforma. |
| **Organiser** | Yes | City ledger account, Member, or No account (cash only). | A City Ledger or Member tender on the folio needs a City ledger or Member organiser. |
| **Other Debtor** | With City ledger | The organiser's account from the list. | Opened by Finance under Account Receivable → Other Debtors. |
| **Member No** | With Member | The organising member's number. | The member's account becomes the billing party. |
| **Organiser name** | With No account | The organiser's name. | |
| **Contact person**, **Contact mobile** | No | Who to call. | Print on the proforma. |
| **Expected players** | No | The size the organiser quoted. | 1 to 999; shown against the roster count. |
| **Club event** | No | Tick for the club's own event (Monthly Medal, captain's day). | Shown only to users who hold Golf Specification; exempt from the share caps and the approval chain, and not counted as a group against members' tee times. |

### Play day

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Date** | Yes | The play date. | One line per date per booking. |
| **Course** | Yes | The course played that day. | Each day may play a different course. |
| **Holes** | Yes | 9 or 18. | |
| **Start format** | Yes | Traditional, Two-tee start, Shotgun or Modified shotgun. | Decides how the tee sheet is held. |
| **First tee time** / **Shotgun time** | Yes | The first tee-off, or the wave time. | Flights are reserved from this time. |
| **Course held until** | Shotgun formats | When the course reopens to other bookings. | Must be after the start time. |
| **Waves** | Shotgun formats | How many waves tee off. | 1 to 4; each wave repeats the start holes. |
| **Start holes** | Modified shotgun | The holes in use, for example "1, 3, 5, 10, 12". | 1 to 18 for 18 holes, 1 to 9 for 9. |

Changing a day's date, course, holes, format or times drops its reserved flights, and is refused while players are drawn into them.

### Roster row

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Type** | Yes | Member, Member as Guest or Guest. | |
| **Member No / Name** | Yes | The member number, or the guest's name. | Members must exist and not be barred. |
| **Hcp** | No | The organiser's declared handicap. | -10 to 54. |
| **Team** | No | A team label for the draw. | |

### Settle - payment line

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Payment type** | Yes | A tender from Payment Type. | A **Deposit**-class tender draws on a held deposit; **Suspend** is not allowed. |
| **Which deposit** | With Deposit | The deposit bill the line draws on. | Up to that deposit's held balance. |
| **Reference** | No | Cheque or transfer reference. | |
| **Amount** | Yes | The line's amount. | All lines must add up to the bill total. |

## Tips & troubleshooting

- **"Reserve flights" refuses with "Only n of m flights can be reserved"** - the cells after the first tee time are taken, held or crossover-only; the message names the first problems. Start later, reserve fewer, or move the day.
- **A shotgun day refuses with players already booked inside the window** - the message lists their tee times; move those bookings or change the window.
- **"Record deposit" is refused with "Credit limit exceeded"** - the organiser's account has no room for the deposit invoice. Finance raises the limit under Account Receivable → Debtors; the deposit bill the attempt created is voided with that reason.
- **Set up a transaction type with charge type Deposit first** - the Deposit item is a Transaction Type of charge type **Deposit**, normally with no tax; the club keeps one.
- **Set up a payment type of class Deposit** - applying a held deposit at settlement needs a Payment Type of class **Deposit**.
- **The proforma does not open** - the document opens in a new browser tab; allow pop-ups for the site, then use **Open proforma**.
- **The Tee Time Sheet shows the players** - register them there with **Register group**; their own extras are billed on their player bill, where no green fee is charged because the package sits on this folio.
- **"This booking is awaiting approval - recall it to make changes"** - a pending booking is frozen; **Recall from approval** brings it back, or wait for the decision.
- **"The booking is approved - reopen it to change its days, flights or charges"** - the approvers decided on the current shape; **Reopen** puts it back to tentative and it goes through approval again.
- **"Deposits are recorded once the booking is approved"** / **"The proforma is issued once the booking is approved"** - submit the booking for approval first.
- **"Players are drawn into flights once the booking is confirmed"** - the deposit is still outstanding; record it (or extend the deadline) and the booking confirms.
- **"Reserve flights for <dates> before submitting"** - every play day needs its flights before the approvers can judge what the booking takes.
- **"That would put group bookings at 45% of E1's tee times... the weekend cap is 40%"** - the day is nearly full of groups; reserve fewer flights, pick another day or course, or ask management to change the cap. The club's own events are flagged as club events and do not count.
- **"You already hold 3 tentative booking(s) with reserved flights"** - submit one of them for approval or release its flights, then reserve again.
- **The Submit preview shows "Against catalog ... 12% off"** - some lines carry a manually keyed price; the approvers see the discount against the rate card.
- **The tee sheet shows "Not confirmed yet" on a group** - the booking is tentative, pending or awaiting its deposit; players register once it is confirmed.
- **A booking shows Lapsed** - its deposit was not in by the pay-by date; the reason is on the header. Reopen it to start again, or request a refund of any deposit it does hold.

## Related options

- [Tee Time Sheet](golf-tee-time-sheet.md) - register the group on the day and bill each player's extras.
- [Transaction Type](golf-transaction-types.md) - the packages, charges and the Deposit item.
- [Golf Specification](golf-settings.md) - the club-wide booking rules, including the Group Bookings control, hold period and deposit terms.
- Workflow → Approval Setup - the approval chain for the purpose **Golf group booking**; its step conditions can test the tee-sheet share, the bill total, the deposit percentage or the organiser's account type.
