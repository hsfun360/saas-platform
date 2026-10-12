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
- A sort control beside the search orders the list by **Urgency** (the booking whose hold or deposit clock runs out first comes first, then the ones awaiting approval, then the rest), **Play date** or **Group**; with group booking control on the list opens on Urgency - the sales pipeline.
- Each booking is a card: the group name as the title, a **Group** or **Tournament** chip (plus a **Club event** chip on the club's own events), the booking number, the play dates and courses, then the organiser, the number of days and the roster count against the expected players.
  The status chip top-right is green for **Confirmed**, blue for **Tentative** and **Pending approval**, red for **Approved** (the deposit clock is running) and grey for **Lapsed** or **Cancelled**.
- With no bookings in the period the screen reads "No group bookings in this period. Use 'New group booking' to make the first one."; a search that matches nothing offers **Clear search**.
  With group booking control on, a line such as "Hold expires in 5 h · 14 Oct, 09:00" or "Deposit 3,000.00 due in 3 days · 18 Oct, 23:59" shows the clock that is running; a card whose clock ends within three days carries a blue edge, within one day a red edge, and "· warned" once the reminder has gone out.
- **Open** goes to the booking's own page; the ⋮ menu holds **Cancel booking**.
- **New group booking** sits bottom-right.

[Screenshot: Group booking page with its section cards]

The booking's page is a stack of collapsible section cards:

1. **Header** - the name with its type chip, **Club event** chip and status chip; underneath the booking number, play dates and organiser; inside, the lifecycle line, then organiser, billing party, contact, expected players, roster count, remarks and (on a cancelled booking) the cancellation reason.
   One button is visible: the booking's next step when it has one - **Submit for approval** (or **Confirm booking** when control is off), or **Recall from approval** while it is pending - and otherwise **Edit details**.
   The ⋮ menu holds **Edit details** (when the next-step button is showing), **Extend deposit deadline**, **Reopen for amendment** / **Reopen lapsed booking** and **Cancel booking**, each only when the state allows it.
2. **Play days & flights** - one block per play day with its date and course, start format, holes, window and remarks, then "N flight(s) · S seats · D drawn" or "No flights reserved yet - the tee sheet is not held for this day.", any waitlist line, and a **planned** chip.
   The visible button is **Reserve flights** (**Reserve again** once flights exist); the ⋮ menu holds **Edit day**, **Join waitlist for this day** / **Leave waitlist** and **Remove day**.
   Reserved flights show as tiles (label, tee time, nine, seats taken); an empty flight carries a red ✕ to release it.
   **Add play day** sits under the blocks.
3. **Roster** - one row per person for the whole booking (number, player, type, handicap, team, where they are drawn), each with a ⋮ menu (**Edit**, **Withdraw** or **List again**, **Remove**), and **Add players**.
   With nobody listed it reads "No players yet. Use 'Add players' to key the organiser's list."
4. **Flight draw** - a play-day picker with a summary ("12 of 16 drawn · 20 seats", and "over capacity: 1A, 2B" when a flight is overfilled), one flight select per listed player, and **Fill in roster order**, **Clear** and **Save draw for <date>**.
5. **Group bill & proforma** - the bill number and its **open** / **settled** chip in the heading, the packages and charges, the proforma terms, **Issue proforma**, and the **Final bill** block with **Settle <total>** and **Void bill**.
6. **Deposits** - the received and held totals in the heading, one card per deposit bill with its standing chip and **Print**, and **Record deposit**.
7. **Refund requests** - the request count and the amount still held, one card per request with its status chip, **Record payout** and **Decline**, and **Request refund of held deposit**.

## Common tasks

### Create a group booking

[Screenshot: New group booking drawer]

1. Click **New group booking**.
2. Pick the **Booking type** (Group or Tournament) and key the **Group / tournament name**.
3. Pick the **Organiser**: a **City ledger account** (a travel agent, society or corporate that Finance opened under Account Receivable → Other Debtors), a **Member** by member number, or **No account** for a cash-only organiser.
4. Key the **Contact person**, **Contact mobile** (pick the country code, then type the number), **Contact email**, the **Expected players** and any **Remarks**; tick **Club event** for the club's own event when the box is offered.
5. Add one **Play day** line per date: the date, course, holes, **Start format**, and the first tee time.
   A **Shotgun** or **Modified shotgun** day also takes the time the course is **held until**, the number of waves, and for a modified shotgun the start holes.
   Use **Add another day** for a second date, which may be on a different course; **Remove day** drops a line.
6. Click **Save**.

The booking opens on its own page.
Nothing is held on the tee sheet yet: that happens when you reserve the flights.

### Add, change or remove a play day

1. In the Play days & flights card, click **Add play day**, or open a day's ⋮ menu and click **Edit day**.
2. The **Add play day** / **Edit play day** drawer takes the same date, course, holes, start format and time fields as the creation form, plus **Remarks** for the day.
   When the day already has flights, a note warns that changing the date, course, holes, format or times drops its reserved flights, and that a day with drawn players cannot change structure.
3. Click **Save**.

To drop a day, open its ⋮ menu and click **Remove day**; the **Remove play day** confirmation names the date and states that its reserved flights go with it, and that only a day with no drawn players can be removed.
Click **Remove play day** to proceed.

### Reserve the flights

[Screenshot: Reserve flights dialog with the seat preview]

1. On the play day, click **Reserve flights** (the button reads **Reserve again** once the day has flights).
   The dialog is titled **Reserve flights - <date>** and restates the format, course, holes and window; when flights already exist it says "The N flight(s) already reserved are replaced."
2. For a **Traditional** or **Two-tee start** day, key the **Number of flights** and the **Players per flight**.
   The flights take consecutive tee times from the day's first tee time, on one nine or alternating both.
3. For a **Shotgun** or **Modified shotgun** day, key the **Holes taking two flights (A/B)** (usually the par 5s; leave blank for one flight per hole), the **Players per flight** and, with more than one wave, the **Gap between waves (minutes)**.
4. Read the preview line - "22 flight(s) × 4 seats = 88 seats" for a sequential day, or "20 flight(s) per wave × 2 wave(s) = 40 flights · 160 seats" for a shotgun day - and the share line beneath it, then click **Reserve N flight(s)**.

Reserved flights hold the tee sheet at once.
A traditional or two-tee flight holds its tee-time cell at full capacity, crossover included, and the tee sheet reads **RESERVED · <group>** on a flight with no players drawn yet.
A shotgun day holds both nines of the course for the whole window, and the tee sheet reads **HELD · <group>** on every row inside it.
Reserving again replaces the day's flights; it is refused while players are drawn into them.
An empty flight can also be released on its own with the red ✕ on its tile; the **Release flight** confirmation names the flight and states that its seats go back to the tee sheet.

The share line states what other groups already hold of that course's tee times on the day and the cap that applies ("...; the cap is 40%" or "...; no cap applies"), then "After this reservation: 45% - over the cap, the reservation will be refused" when it would not fit; a shotgun day counts its whole hold window, and a club event reads "A club event is exempt from the cap."
Management sets the caps under Golf Specification → Group Bookings; a reservation that would push all groups past the cap is refused with the numbers.
With the tentative-bookings-per-user cap on, you may hold only that many tentative bookings with reserved flights at a time - submit one or release its flights before reserving more.

With group booking control on, the tee sheet names the state as well until the booking is confirmed: the held or reserved tag becomes **HELD · TENTATIVE · <group>**, **HELD · PENDING · <group>** or **HELD · APPROVED · <group>** (and **RESERVED · TENTATIVE · <group>** and so on for sequential flights).
A tentative booking's flights are held only for the tentative hold period set in Golf Specification; reserving again restarts that clock, and the lifecycle line on the header shows when it runs out.
If it runs out before you submit, the flights are released, you receive a notification, and the booking stays tentative without flights - reserve them again when you are ready.

### Join the waitlist for a day another group holds

Group booking control on only.

1. On a tentative booking, a play day whose flights could not be reserved shows why - another group holds the course, or is next in line for it: "Another group is next in line for this course and date until <date, time>; join the waitlist to be offered it next."
2. Open the day's ⋮ menu and click **Join waitlist for this day**.
   The day shows your place: "On the waitlist - position 2 of 3. You are told when the day frees up."
3. When the holding group's space frees up (its hold expires, it is rejected, lapses, is cancelled, or removes the day), the first group in the queue is told by bell and email that it is **next in line**.
   For the next-in-line hours set in Golf Specification, no other group may reserve flights on that course and date; the day reads "Next in line: this course and date are yours to reserve until <date, time> - no other group can take them meanwhile."
4. Click **Reserve flights** on the day as usual; the queue entry is marked taken.
   If the window passes unanswered, the offer moves to the next group and the day reads "Your next-in-line offer passed unanswered; join the waitlist again if you still want the day."

**Leave waitlist** in the same menu gives up your place (and a live offer, which then passes on at once); the **Leave waitlist** confirmation states which of the two applies.
Members' own bookings are never held back by the queue - it is fair play between groups only.
A booking that is cancelled or lapses leaves every queue it was in.

### Reminders and notices

The system watches the clocks for you.
Twenty-four hours before a tentative booking's hold runs out, and twenty-four hours before an approved booking's pay-by date while the deposit is still short, whoever created the booking gets a bell notification and an email.
The deposit reminder also goes to the organiser's **Contact email** on the booking, worded for the organiser.
When a hold expires or a booking lapses, the same people are told what was released and what to do next.
Each reminder goes once per clock; extending the deadline, reopening or reserving again starts a fresh clock and a fresh reminder.
The email wording is maintained under System Setup → Email Templates (the Golf group booking templates).

### Submit for approval

[Screenshot: Submit for approval dialog with the per-day shares and the approval steps]

Group booking control on only.

1. Reserve flights for every play day and key the group bill and the proforma terms (the approvers decide on them).
2. On the header, click **Submit for approval**.
3. Read the preview: for each play day the number of flights, the share of that day's tee times this booking takes, and the share all groups hold once it is in; the bill total, the price per player, any manually keyed prices, and the deposit demanded against what is already held; then the approval steps and who decides each one.
   The last line states the outcome: who it goes to, or that it is approved at once because no chain applies, and when the deposit falls due.
4. Click **Submit for approval** (or **Approve and demand deposit** / **Approve and confirm** when no chain applies).
   The button stays greyed out while a play day has no flights; the outcome line then reads "Reserve flights for <dates> first - the approver decides on the tee sheet the booking takes."

While the booking is pending, its flights stay held and nothing on it can change; **Recall from approval** opens a confirmation (click **Recall booking**) that takes it back to tentative with everything kept and restarts the hold clock on its flights.
When the approvers approve, the booking becomes Approved: the proforma can be issued, deposits recorded, and the deposit must be in by the pay-by date.
If a deposit is not needed (the proforma states 0.00, or the default deposit percentage is 0), approval confirms the booking at once.
When they reject it, the booking returns to tentative and its flights are released - amend the charges or the shape, reserve the flights again, and resubmit.
With control off, the header button reads **Confirm booking**, the dialog of the same name shows the same preview with the line "Group booking control is off for this club - submitting confirms the booking at once.", and its button reads **Submit**.

### Extend the deposit deadline

[Screenshot: Extend deposit deadline dialog]

1. On an Approved booking, open the ⋮ menu and click **Extend deposit deadline**.
   The dialog restates the deposit due and when, and reminds you that a deadline can be extended once and that the booking lapses after the new date.
2. Pick the **New pay-by date** (later than the current one) and give the **Reason**; both are required.
3. Click **Extend to <date>**.

A deadline can be extended once per booking.
When the pay-by date passes with the deposit short, the booking lapses: its flights are released, the reason is recorded on the header, and whoever created it is notified.

### Reopen a booking

1. On an Approved, Confirmed or Lapsed booking, open the ⋮ menu and click **Reopen for amendment** (or **Reopen lapsed booking**).
2. Read the confirmation, which states what reopening does for that state, and click **Reopen booking**.

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
A player's row has a ⋮ menu with **Edit**, **Withdraw** (or **List again** on a withdrawn player) and **Remove**.
A withdrawn player shows greyed out with "Withdrawn" in the Drawn column and leaves every flight they were only booked into; a player who has already registered can only be withdrawn, never removed.
**Edit** opens the **Edit player** drawer with the same row fields plus a **Status** select (Listed or Withdrawn).
**Remove** opens the **Remove player** confirmation, which names the player and states that any flight they were drawn into frees the seat; click **Remove player** to proceed.

### Draw the players into flights

[Screenshot: Flight draw with the play-day picker and flight selects]

1. In the Flight draw card, pick the **Play day**.
   The summary beside it reads "12 of 16 drawn · 20 seats" and turns red with "over capacity: 1A" when a flight holds more players than its seats.
   The card tells you what is still missing: "Add a play day first.", "Reserve this day's flights before drawing." or "Add players to the roster before drawing."; with control on, a booking that is not yet confirmed reads "Players are drawn into flights once the booking is confirmed." and the selects are read-only.
2. Click **Fill in roster order** to place every listed player into the flights in order, or pick a flight for each player in their select ("Not drawn" leaves them out).
   Each option shows the flight's live load, for example "1A · 07:30 · E1 (3/4)".
   **Clear** empties every select.
3. Click **Save draw for <date>**; it stays greyed out until something changed.

Saving writes the players onto the tee sheet.
A flight never takes more than its capacity, and a player who has already registered on that day shows locked and cannot be moved or taken out.
Each day is drawn on its own, so a player can be in different flights on different days.

### Bill the packages and charges

[Screenshot: Group bill card with items and the add-item line]

1. In the Group bill & proforma card, pick the **Billing item**, key the **Quantity** and click **Add item**.
   A package is billed per player, so key the number of players: the button reads "Add package × 24" and the package explodes into its element lines.
   An item that allows a manual price also offers a **Unit price**.
2. Change a quantity or an allowed price in the row, or remove a row with ✕; a package line removes its whole package.
   A line with a manually keyed price carries an **amended** tag, a package's lines a **package** tag.

The group bill is created with the first item and priced on the first play day; until then the card reads "No packages or charges keyed yet. Add the first item below - the group bill is created with it."
It is open until it is settled as the final bill.
With group booking control on, the items and terms are frozen once the booking is submitted: the card reads "The bill is frozen while the booking awaits approval." or, after approval, "The bill is frozen - the booking was approved on these charges. Reopen the booking to change them."

### Void the group bill

1. In the Final bill block, click **Void bill**.
2. The **Void group bill** dialog names the bill and states that its items and proforma are discarded, that the next item starts a new bill, and that deposits are untouched.
3. Type the **Reason** (required) and click **Void bill**, or **Keep** to back out.

### Issue the proforma invoice

1. Key the **Deposit required** and the **Pay by** date, then click **Save terms**.
2. Click **Issue proforma**.

The proforma gets its number from the Proforma series and opens in a new tab for printing; **Open proforma** reopens it any time.
After a change to the items or terms, **Re-issue and print** keeps the number and raises the revision.

### Record a deposit

[Screenshot: Record deposit dialog with the outcome line]

1. In the Deposits card, click **Record deposit**.
2. Key the **Amount received** (it defaults to what the proforma still demands), pick the **Payment type**, and add the **Reference** (cheque number, transfer reference) and **Remarks** if useful.
3. Read the outcome line before you commit:
   - a cash-type tender: "A deposit bill of <amount> is raised and settled by CASH - the money is received now.";
   - a **City Ledger** or **Member** tender: "A deposit bill of <amount> is raised and charged to <organiser>'s account as a normal AR invoice. The folio shows whether it has been paid.";
   - an account tender on a booking with no billing account is refused in the line itself: "<tender> charges an account, but this booking has no billing account - pick a cash-type tender or set the organiser's account first."
4. Click **Record deposit**.

Each deposit is its own deposit bill with one Deposit item, printable from its card with **Print**.
The card's standing chip reads **Paid · <tender>** (green) for a cash-type deposit; for an on-account deposit it reads the live standing from Account Receivable each time the page opens - **Outstanding · <amount> on <invoice>** (red), **Partially paid · <paid> of <total>** (blue) or **Paid · <receipt no.>** (green) - and **On account · <invoice>** while the standing is not yet available; a voided deposit reads **Voided** (grey) with its reason underneath.
The settlement lines (receipt or credit note, date, amount, method) and the applied / refunded / held split are listed on the card as they happen.
A cash deposit keyed in error can be voided from its ⋮ menu (**Void deposit**): the dialog states that the money is not refunded here, and needs a **Reason**; click **Void deposit** or **Keep**.
An on-account deposit, or one already applied to the final bill, has no void option - it is on the ledger and is reversed by Finance.

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
Its card shows the amount, request number, date and reason with a status chip: **requested** (blue), **paid** (green) or **declined** (grey).
Finance then clicks **Record payout** on the request and keys **Paid by** (required: bank transfer, cheque, or credit note for a deposit that was charged to account) and an optional **Reference**, then clicks **Record payout**; the card then reads "Paid <date, time> by <method> · <reference>".
Or Finance clicks **Decline** in the ⋮ menu, gives the **Reason** (required) and clicks **Decline**; the card reads "Declined <date, time>: <reason>" and the money is held on the folio again.
Golf never posts credit notes; the Account Receivable side of a refund is Finance's decision.

### Cancel a booking

1. On the card or the page, open the ⋮ menu and click **Cancel booking**.
2. The **Cancel group booking** dialog names the booking and states what is released; key the **Reason** and click **Cancel booking**, or **Keep booking** to back out.

Every play day's hold is released and all booked players come off the tee sheet; registered players stay on record.
If the organiser owes a cancellation charge, add it to the group bill and settle it from the held deposit; the remainder is then requested as a refund.
The folio stays workable on a cancelled booking while its group bill is open; no new deposits can be recorded.

## Field reference

### Header

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Booking type** | Yes | Group or Tournament, picked from the select. | Both work the same way; it only changes the chip shown on the booking. |
| **Group / tournament name** | Yes | The name as the organiser calls it. | Up to 150 characters; prints on the proforma. |
| **Organiser** | Yes | City ledger account, Member, or No account (cash only). | A City Ledger or Member tender on the folio needs a City ledger or Member organiser. |
| **Other Debtor** | With City ledger | The organiser's account from the list. | Opened by Finance under Account Receivable → Other Debtors. |
| **Member No** | With Member | The organising member's number. | The member's account becomes the billing party. |
| **Organiser name** | With No account | The organiser's name. | |
| **Contact person**, **Contact mobile** | No | Who to call. | Print on the proforma. |
| **Contact email** | No | The organiser's email address. | Must be a valid address; receives the deposit-due reminder and the lapse notice. |
| **Expected players** | No | The size the organiser quoted. | 1 to 999; shown against the roster count. |
| **Remarks** | No | Any note about the booking. | Up to 255 characters; shown on the header. |
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
| **Remarks** | No | A note about the day (Add / Edit play day drawer only). | Up to 255 characters; shown on the day block. |

Changing a day's date, course, holes, format or times drops its reserved flights, and is refused while players are drawn into them.

### Reserve flights dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Number of flights** | Traditional / Two-tee: Yes | How many consecutive tee times to take from the first tee time. | 1 to 80. |
| **Holes taking two flights (A/B)** | Shotgun formats: No | The holes that start two flights, for example "1, 9, 10, 18". | Blank = one flight per hole. |
| **Gap between waves (minutes)** | Shotgun with more than one wave: Yes | How long after the first wave the next tees off. | 30 to 600. |
| **Players per flight** | Yes | The seats each flight holds. | 1 to 6. |

### Roster row

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Type** | Yes | Member, Member as Guest or Guest. | |
| **Member No / Name** | Yes | The member number, or the guest's name. | Members must exist and not be barred. |
| **Hcp** | No | The organiser's declared handicap. | -10 to 54. |
| **Team** | No | A team label for the draw. | |
| **Status** | Edit player only | Listed or Withdrawn. | A withdrawn player leaves the flights they were only booked into. |

### Record deposit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Amount received** | Yes | The money received, defaulting to what the proforma still demands. | More than 0.00. |
| **Payment type** | Yes | The tender, from Payment Type. | A City Ledger or Member tender needs an organiser with an account. |
| **Reference** | No | Cheque number or transfer reference. | Up to 100 characters. |
| **Remarks** | No | A note kept on the deposit bill. | Up to 255 characters. |

### Extend deposit deadline dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **New pay-by date** | Yes | The new deadline for the deposit. | Later than the current pay-by date; one extension per booking. |
| **Reason** | Yes | Why the deadline is extended. | Up to 255 characters; shown on the lifecycle line. |

### Record refund payout dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Paid by** | Yes | How Finance paid it: bank transfer, cheque, credit note. | Up to 100 characters. |
| **Reference** | No | The payment reference. | Up to 100 characters. |

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
- **"<Group> is next in line for this course on <date> and may reserve until …"** - another group's waitlist offer is live; join the waitlist to be offered the day next, or pick another day.
- **"This day already holds flights - the waitlist is for a day you could not reserve"** - release the day's flights first if you really want to queue instead.
- **The Submit preview shows "Against catalog ... 12% off"** - some lines carry a manually keyed price; the approvers see the discount against the rate card.
- **The tee sheet shows "Not confirmed yet" on a group** - the booking is tentative, pending or awaiting its deposit; players register once it is confirmed, and until then the held rows name the state (**HELD · TENTATIVE · <group>** and so on).
- **The Reserve, Add players or Settle buttons are missing** - your role lacks the Edit permission on this screen, or the booking lies outside your data scope; a user without the Delete permission does not see **Remove day** or **Remove** on a player.
- **A booking shows Lapsed** - its deposit was not in by the pay-by date; the reason is on the header. Reopen it to start again, or request a refund of any deposit it does hold.

## Related options

- [Tee Time Sheet](golf-tee-time-sheet.md) - register the group on the day and bill each player's extras.
- [Transaction Type](golf-transaction-types.md) - the packages, charges and the Deposit item.
- [Golf Specification](golf-settings.md) - the club-wide booking rules, including the Group Bookings control, hold period and deposit terms.
- Workflow → Approval Setup - the approval chain for the purpose **Golf group booking**; its step conditions can test the tee-sheet share, the bill total, the deposit percentage or the organiser's account type.
