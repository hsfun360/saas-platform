# Facility Bookings

> **Where:** Facility Management → Facility Bookings
>
> **Who can use it:** users whose role includes the Facility Management module.
> Holding slots and the Book button need the Create permission.
> The ⋮ menu on a booking and the Cancel booking, Participants, Open bill, Void bill and Settle buttons need the Edit permission, and the booking or bill must be within your data scope.

## What this option is for

The Facility Bookings screen is where the front desk books courts, halls and other facilities that are reserved by time slot.
You pick a facility type and a day, click a run of slots on one facility in the day grid, key in who is booking and who will take part, and confirm.
The grid is worked out live from the slot sets of the Facility Type, the Facility Closures, the classes scheduled on the facility and the bookings already made, and every rule in Facility Specification and on the Facility Type (booking window, slots per day, consecutive slots, participants, guest control, suspensions) is checked again when you confirm.
Staff also come here to look up a booking, change its participants or cancel it; before a cancellation goes through, the screen tells you whether it falls inside the cancellation notice and what charge, if any, will be raised.
This screen also holds the one bill drawer of Facility Management: the bill of a booking is opened, filled, settled or voided here, and a bill started at the Control Station (for an entry, a Utility Item or a class) opens in this same drawer.
Facilities that people simply enter (a gym, a pool) are not booked here; they are registered at the Control Station.

## The screen at a glance

[Screenshot: Facility Bookings day grid with the bookings list underneath]

- A **Facility type** picker and a **Date** field sit at the top.
  The picker lists the active facility types that use time slot booking, and the system remembers the type you last chose on this device.
  The arrows beside the date move one day back or forward, and **Today** returns to today.
- The grid heading shows the day of the week, a **Weekday** or **Weekend** tag (a public holiday counts as a weekend) and the slot length of the slot set in force, for example "60-minute slots".
- The grid has one column per facility of the type and one row per time slot.
  A legend explains the cells: **Available**, **Front desk** (a slot kept for the front desk, marked "desk", which you can book here), **Booked**, **Being booked** (held by another user, shown with a clock-lock icon), **Closed** and **Class**.
  A booked cell shows the booker's name, with "pending" while the booking awaits approval or "checked in" once the slot was checked in at the Control Station.
  A slot whose start time has passed reads "started" and cannot be picked.
  The slots you are holding show a tick.
- Under the grid, the **Bookings** list shows the bookings of the chosen type and date, earliest first, with a count such as "3 live on 14 Nov 2026, 1 cancelled".
- A search box above the list finds bookings on any date by booking number, booker name or member number.
- Each booking is a card: the booking number, the facility and the time as the title; then the booker with the member number or "(visitor)", a bill chip such as "Bill FBL-00012 · open" when the booking has a bill, the number of slots, the first participants, the contact mobile, and "Late cancellation" on a booking cancelled inside the notice.
- A status chip at the top right shows **Booked** (green), **Pending approval** (blue), **No show** (red) or **Cancelled** (grey).
  No show appears when every slot of the booking was recorded as a no-show at the Control Station.
- Each card has a **View** button.
  A booking that is not cancelled also has a ⋮ menu holding **Open bill** (or **Bill** with the bill number once one exists), **Cancel booking** and, while cancellation notice and no-show control is switched on, **Cancel and waive charge**.
- While you hold slots, a bar at the bottom of the screen shows the selection, the time left, a **Clear** link and the **Book** button.
- If no facility type uses time slot booking yet, the screen reads "No slot-booked facility type is set up yet. Add a Facility Type with the Time slot booking mode, give it a slot set and some facilities, then come back to book."

## Common tasks

### Make a booking

1. Pick the **Facility type** and the **Date**.
2. In the grid, click the first slot you want on a facility.
   The system holds the slot for you at once so that no other desk can take it.
3. Click more slots on the same facility to extend the booking, or click a held slot again to drop it.
   The slots of one booking must follow one another on one facility; clicking a slot on another facility starts a new selection there.
4. Check the bar at the bottom: it reads, for example, "CT1 · 09:00 - 11:00 · 2 slots" and "held for 4:32".
   The hold length comes from **Booking Lock (minutes)** in Facility Specification, and the countdown starts again each time you change the selection.
   **Clear** releases the slots.
5. Click **Book 2 slots** (the button shows the number of slots you hold).

[Screenshot: New booking drawer with the booker, participants and the booking checks]

6. The **New booking** drawer opens with a banner naming the facility, the day, the time and "held, confirm within 4:32".
7. Under **Booker**, choose who is booking:
   - **Member** - key in the **Member number** and click **Check** (pressing Enter also checks).
     A card shows the member's name, number, membership category and status, the dates the member may book ("Window 14 Nov 2026 to 21 Nov 2026"), the guest visits used this month and any slots of this type the member already holds that day.
     A member whose status carries a warning can still book; the booking checks then show a line such as "Member A0018 is Overdue - booking allowed with this standing shown."
     The check also adds the member as the first participant and fills the **Contact email** from the member record when it is empty.
   - **Visitor** - key in the **Name**, and optionally the **IC / passport**, **Mobile** and **Email**.
     An IC or passport number (or, failing that, a mobile number) already on record brings back the same visitor instead of creating a new one.
8. Under **Participants**, click **Add participant** for each person taking part.
   Pick the **Type** on each line, then key in the **Member No** for a member, or the **Guest name** for a visitor guest.
   Use the ✕ button to remove a line.
   For a visitor booking with guests, also key in the **Host member for guests**, the member whose monthly guest allowance the guests draw on.
9. Under **Contact and remarks**, optionally enter the **Contact mobile**, the **Contact email** and **Remarks**.
10. Read the booking checks at the bottom of the drawer.
    They show, before you confirm, what the system will decide, for example:
    - "Inside the booking window (7 days ahead, up to 21 Nov 2026)."
    - "2 of 2 BADM slots that day for Ahmad Faizal."
    - "3 participants per slot (2 to 4)."
    - "1 of 3 remaining monthly guest visits for Ahmad Faizal (4 per month)."
    - "Submitted for approval (BADM bookings) - the slots are held while the club decides."
    A line marked with a cross is a rule the booking breaks; the confirm button stays greyed out until you fix it.
11. Click **Confirm 2 slots**.

The system checks every rule again, issues the booking number and shows "Booking FB-000123 confirmed.".
The booking appears in the list, highlighted, and the cells on the grid turn Booked.
One confirmation email goes to the contact email, to a visitor booker's email, and to the booker and every member participant who has an email on their member record.
If the countdown runs out before you confirm, the slots are released, the drawer closes and the screen reads "The slot claim expired - pick the slots again.".
Clicking **Cancel** or closing the drawer releases the slots; if you have typed anything, the system first asks "Discard this booking?".

### A booking that awaits approval

When the Facility Type is set so that every booking needs approval, or a participant is of a Participant Type that needs approval, the booking checks say so before you confirm.
The save answers "Booking FB-000124 submitted for approval - the slots are held." and the card shows the **Pending approval** chip.
The slots stay held while the club decides through its approval chain.
On approval the booking turns **Booked** and the confirmation email is sent; on rejection the booking is cancelled, its slots are released and the rejection is emailed with the reason.
A pending booking cannot be billed and this screen does not offer its Participants button, but it can be cancelled, which withdraws the approval request.
With no approval chain set up for the purpose Facility booking in Workflow Setup, such a booking is booked at once.

### View a booking

[Screenshot: Booking drawer showing slots and participants]

1. Click **View** on the booking's card, or click a booked cell in the grid.
2. The **Booking** drawer shows the status, when and where it was booked ("at the front desk" or "at the member portal"), the facility type, date, time, booker, contact details and remarks.
   **Slots** lists each slot with its facility, time and status (booked, checked-in, no-show or cancelled).
   **Participants** lists each person with their type, a **Host** tag on the host member and a **Guest visit recorded** tag on a guest counted against the host's monthly allowance.
3. A cancelled booking also shows when it was cancelled and the reason, and a **Late cancellation** chip when it was cancelled inside the notice.
4. While cancellation notice and no-show control is on, a note under the participants reminds you of the notice, for example "No-show control is on: cancelling inside the 24-hour notice is recorded as a late cancellation."
5. The buttons at the bottom offer **Cancel booking**, **Participants** and **Open bill** (or **Bill** with its number) for a booked booking, and **Close**.
   A cancelled booking that still has a bill keeps the **Bill** button so that you can look at it.

### Change the participants of a booking

[Screenshot: Participants view of the booking drawer]

1. Open the booking with **View** and click **Participants**.
2. Add, remove or correct the lines exactly as on a new booking.
   The **Host member for guests** field names the member whose guest allowance the guests draw on; leave it empty to keep a member booker as the host.
3. Click **Save 3 participants** (the button shows the number of lines), or **Back** to return without saving.

The new list replaces the old one on every slot of the booking, and the guest visits on the host's monthly allowance are recorded again to match.
The same rules as on a new booking apply: the participant count, guest control and the slots-per-day limit of any member you add.
Participants can no longer be changed once a slot of the booking has been checked in.
The slots, the booker and the contact details of a saved booking cannot be changed on this screen; to move a booking, cancel it and make a new one, minding the cancellation notice.

### Cancel a booking

[Screenshot: Cancel this booking confirmation]

1. Open the card's ⋮ menu and click **Cancel booking**, or click **Cancel booking** in the booking drawer.
2. Read the confirmation; it states exactly what will happen:
   - It always names the booking and how many slots are released, for example "Booking FB-000123 (CT1 14 Nov 2026 09:00) will be cancelled and its 2 slots released."
   - With guests on the booking it adds "1 guest visit on the host's monthly allowance will be voided."
   - For a pending booking it adds "The pending approval is withdrawn."
   - While cancellation notice and no-show control is on, it says whether you are inside the notice: "This is inside the 24-hour notice - it is recorded as a LATE cancellation." or "Outside the 24-hour notice - no late-cancellation record."
   - When a charge applies it names the amount: "A late cancellation charge of 21.20 (NOSHOW - No Show Charges) is raised to the booker's account."
     For a visitor booker it ends "- a visitor, so it stays pending for the desk".
     When the charge has no price yet it reads "A late cancellation charge is raised unpriced (...) for the office to price."
3. Click the red button, which reads **Cancel booking**, **Cancel booking (late)** or **Cancel and charge** according to the outcome, or **Keep booking** to back out.

The booking turns **Cancelled**, its slots are freed on the grid and a cancellation email is sent.
The message tells you what became of the charge, for example "Booking FB-000123 cancelled - inside the 24-hour notice, recorded as a late cancellation. Late cancellation charge 21.20 posted to the account (INV-000045)."
A charge that could not be posted stays pending on the No-show Charges screen with the reason.
When the club refuses cancellations inside the notice (Facility Specification, **Late cancellation** set to **Refuse the cancellation**), the confirmation is titled "Cancellation refused inside the notice" and offers only **Cancel and waive the charge** or **Keep booking**.

### Cancel inside the notice and waive the charge

[Screenshot: Cancel and waive view of the booking drawer]

1. Open the card's ⋮ menu and click **Cancel and waive charge**, or click **Cancel and waive the charge** on the refused confirmation.
2. The drawer names the booking and tells you where you stand: "Inside the 24-hour notice. The late cancellation charge of 21.20 is recorded as waived." or "Outside the notice - no charge applies; a plain cancel will do."
3. Optionally enter the **Cancellation reason**.
4. Enter **Why the charge is waived**; this is required.
5. Click **Cancel and waive**, or **Keep booking** to back out.

The booking is cancelled.
When the cancellation is inside the notice, the charge is kept on the No-show Charges screen as **Waived** with your reason, so nothing is posted to the booker's account.

### Open a booking's bill and add items

[Screenshot: Bill drawer with items, totals and the Add items tiles]

1. Open the card's ⋮ menu and click **Open bill**, or click **Open bill** in the booking drawer.
   Only a booked booking can be billed, and a booking has one bill at a time.
2. The system issues the bill number, shows "Bill FBL-00012 opened." and charges the default fees of the Facility Type automatically: the facility fee (one line per slot, or one line for the booking, as the fee item is set up) and a guest fee for each guest participant.
   Each fee is priced from its price card for the day type, the session and the participant type.
   A warning at the top of the bill tells you when a default fee could not be found, for example "No active facility-fee item is the default for 'member' on BADM - the facility fee was not auto-charged."
3. The bill lists each item with its **Qty**, **Price**, **Tax** and **Payable** amount, and the **Tax** and **Total** of the bill underneath.
4. To add an item, click its tile under **Add items**.
   The tiles are the billing items from Transaction Types that belong to this facility type or to every type.
5. To change a quantity, type a new **Qty** on the line.
6. To change a price, type a new **Price** on the line.
   The price box is open only on items that Transaction Types allow to be re-priced at billing; a changed price is marked "amended".
7. To take an item off, click the ✕ on its line.

The totals update after every change.
Click **Back** to return to the booking; the bill stays open, and the card shows the chip "Bill FBL-00012 · open" until it is settled.

### Settle a bill

[Screenshot: Settle bill view with payment lines and the Remaining amount]

1. In the bill drawer, click **Settle**.
   The button is greyed out while the bill has no items.
2. The view shows the bill **Total** and a **Remaining** amount, and starts with one payment line for the full total.
3. Pick the payment type on the line, check the amount, and optionally type a **Reference** such as a card slip number.
4. To split the bill over several payment types, lower the amount on the first line and click **Add payment**; the new line starts with the amount still remaining.
   Use the ✕ button to remove a line.
5. Watch **Remaining**: the payments must add up to the bill total exactly.
6. Click **Settle 53.00** (the button shows the bill total and stays greyed out until Remaining is 0.00), or **Back** to return to the bill without settling.

The message reads "Bill FBL-00012 settled.", the bill returns to its read-only view with a **Payments** list, and the chip on the booking card turns green.
A settled bill can no longer be changed or voided on this screen.

### Charge a bill to an account

1. In the settle view, pick a payment type of the **Member** class to charge the amount to the booker's own member account.
   The booker must be a member, and the member's status must allow charging to account.
2. Or pick a payment type of the **Debtor** class and choose the account in the **Charge to Other Debtor** box that replaces the Reference box.
   The list holds the active Other Debtors of Account Receivable; when it is empty the screen reads "No active Other Debtor in Account Receivable - Finance keys them under AR - Other Debtors."
3. Click **Settle**.

The system posts an invoice to that account in Account Receivable and shows its number beside the payment in the **Payments** list.
Both kinds of charge are checked against the account's credit limit; if the account refuses the charge, the bill is not settled and the message tells you why.
You can mix an account charge with other payment types on the same bill.

### Void a bill

[Screenshot: Void this bill confirmation]

1. In the bill drawer of an open bill, click **Void bill**.
2. Read the confirmation, for example "Bill FBL-00012 (2 lines, total 53.00) will be voided. The booking stays and can be billed again."
3. Click **Void bill**, or **Keep bill** to back out.

The bill turns **voided** and shows when it was voided.
The booking is not affected, and **Open bill** on the booking starts a fresh bill.
Only an open bill can be voided.

### Bills opened from the Control Station

The Control Station has no bill screen of its own.
When you click **Bill** or **Open bill** there - on a booked slot, on an entry to a facility or on a Utility Item such as a towel or a locker - the system brings you to this screen and opens that bill in the same drawer.
The bill of a class enrolment opens here in the same way.
The drawer title says what the bill is for, for example "Bill FBL-00020 - entry REG-00031" or "Bill FBL-00021 - TOWEL for Lim Wei".
You add items, settle and void it exactly as described above.
**Back** on the bill of an entry, a Utility Item or a class closes the drawer, because there is no booking to return to.

### Find a booking on any date

1. Type at least two characters of a booking number, a booker's name or a member number in the search box above the list.
2. The list changes to "n matching across all dates" and each card also shows its facility type and date.
   Up to 50 bookings are shown, the most recently made first.
3. Click **View** to open one, or the ✕ in the search box (or **Clear search**) to return to the day's list.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Facility type** | Yes | The kind of facility to book, e.g. `BADM - Badminton Court`. Type to filter the list. | Only active facility types with the Time slot booking mode are listed. |
| **Date** | Yes | The day to show and book; pick from the calendar or use the arrows. | Starts on today. Changing the type or the date releases any slots you are holding. |
| **Search** | No | Part of a booking number, booker name or member number. | At least 2 characters; searches every date and every facility type; up to 50 results. |

### New booking drawer - Booker

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Booked by** | Yes | **Member** for a member's booking, **Visitor** for someone who is not a member. | Starts on Member. |
| **Member number** | Yes for a member booking | The booker's member number, e.g. `A0018`; click **Check** to see the member's standing and booking window. | Up to 50 characters; must be an existing member who is not barred from booking and not under a booking suspension on that date. |
| **Name** | Yes for a visitor booking | The visitor's name as it should appear on the booking. | Up to 255 characters. |
| **IC / passport** | No | The visitor's identity number; it lets the system recognise a returning visitor. | Up to 50 characters. |
| **Mobile** | No | The visitor's mobile; pick the country code, then type the number. | Also used to recognise a returning visitor when no IC or passport is given. |
| **Email** | No | The visitor's email, used for the confirmation. | A valid email address, up to 255 characters. |

### New booking drawer - Participants

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Type** (per line) | Yes | The kind of participant, from the club's Participant Types, e.g. Member, Member as Guest or Guest. | Decides whether the line takes a member number or a name, which guest fee is billed and whether the booking needs approval. |
| **Member No / Guest name** (per line) | Yes | The member number for a member or a member playing as a guest; the name for a visitor guest. | Member number up to 50 characters, and the member must exist and not be barred or suspended; guest name up to 255 characters. |
| **Add participant** | - | Adds a line. | Up to 50 lines; the Facility Type may set a minimum and a maximum per slot. |
| **Host member for guests** | Only for a visitor booking with guests | The member number of the member whose monthly guest allowance the guests draw on. | Up to 50 characters. Shown for a visitor booking and when editing participants; on a member booking the booker is the host. |

### New booking drawer - Contact and remarks

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Contact mobile** | No | A number the desk can call about this booking; pick the country code, then type the number. | For a visitor booking left empty, the visitor's mobile is used. |
| **Contact email** | No | Where the confirmation email is sent. | A valid email address, up to 255 characters; filled from the member record by **Check** when empty. |
| **Remarks** | No | Any note for the desk, e.g. `Needs two extra rackets`. | Up to 255 characters. |

### Participants view

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| Participant lines | - | The same **Type** and **Member No / Guest name** lines as on a new booking. | The saved list replaces the old one on every slot; not allowed once a slot is checked in. |
| **Host member for guests** | No | The member whose guest allowance the guests draw on. | Up to 50 characters; left empty, a member booker is the host. |

### Cancel and waive view

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Cancellation reason** | No | Why the booking is cancelled, e.g. `Court flooded`; it is kept on the booking and included in the cancellation email. | Up to 255 characters. |
| **Why the charge is waived** | Yes | The reason the club is not charging; it is kept on the charge record. | Up to 255 characters. |

### Bill drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Qty** (per item) | Yes | How many of the item to charge. | A whole number, 1 or more; the box steps from 1 to 99. |
| **Price** (per item) | Yes | The unit price; amounts always display with two decimals (0.00). | 0.00 or more; can be changed only on items that Transaction Types allow to be re-priced at billing. |
| **Add items** tiles | - | Click a tile to add one of that item, priced from its price card. | Items of another facility type, packages, deposits and no-show charges are not offered. |

### Settle view

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| Payment type (per line) | Yes | How this part of the bill is paid, from the club's Payment Types. Type to filter the list. | A Member class type charges the booker's member account; a Debtor class type charges an Other Debtor. |
| Amount (per line) | Yes | The amount paid this way; always shown with two decimals. | More than 0.00; all lines together must equal the bill total. |
| **Reference** (per line) | No | A slip, voucher or approval number for the payment. | Up to 100 characters; not shown on a Debtor class line. |
| **Charge to Other Debtor** (Debtor class line) | Yes | The Account Receivable account to charge. | Must be an active Other Debtor. |
| **Add payment** | - | Adds a payment line with the amount still remaining. | Up to 10 lines. |

## Tips & troubleshooting

- If you see "CT1 at 09:00 was just taken - refresh the grid." or "CT1 at 09:00 was just booked - pick the slots again." another desk took the slot first; pick another slot.
- If you see "The slot claim expired - pick the slots again." or "Your slot claim has expired - pick the slots again." the hold ran out before you confirmed; select the slots again.
- If you see "The slots of one booking must be consecutive." the slots you clicked leave a gap; pick slots that follow one another on the same facility.
- If you see "At most 2 consecutive slots per booking." the Facility Type limits how long one booking may run.
- If you see "Too many slots for one booking." one booking can hold at most 20 slots.
- If you see "That slot has already started." the slot's start time has passed on the club's clock.
- If you see "CT1 is closed at 09:00." or "CT1 is reserved for Yoga at 09:00." a Facility Closure or a class covers that slot.
- If you see "Member: no member found with number 'X'." or "Booker: no member found with number 'X'." check the member number.
- If you see "Member A0018 (Defaulter) is barred from booking." the member's status forbids booking; resolve it under Membership first.
- If you see "Ahmad Faizal (A0018) is suspended from booking until 30 Nov 2026." or "Participant 2: Lim Wei (A0020) is suspended from booking until 30 Nov 2026." the member is under a booking suspension that covers the booking date; see Booking Suspensions.
- If you see "Same-day booking is off - today is front-desk registration only." the club does not take bookings for today; the switch is **Allow same-day booking** in Facility Specification.
- If you see "Date 2026-12-20 is outside the booking window (bookable up to 2026-11-21)." the date is further ahead than the booker may book; the advance days come from Facility Specification, the Facility Type or the member's Membership Type.
- If you see "Date 2026-11-10 is in the past." pick today or a later date.
- If you see "At least 2 participants per slot." or "At most 4 participants per slot." add or remove participants to fit the Facility Type's limits.
- If you see "Ahmad Faizal (A0018) would hold 3 slots that day - the weekday limit is 2 (already holding 1)." the booker or a member participant would pass the Facility Type's slots-per-day limit.
- If you see "Visitor guests are not allowed on BADM at 09:00 on 2026-11-14." or "Members as guests are not allowed on BADM at 09:00 on 2026-11-14." the club's guest control rules forbid that kind of guest at that time.
- If you see "At most 2 visitor guests per booking on BADM." remove a guest line.
- If you see "A member must host the guests - book as a member or name the host." fill in **Host member for guests**.
- If you see "BADM requires the host (A0018) to take part - add Ahmad Faizal as a participant." the Facility Type requires the host on the booking.
- If you see "Ahmad Faizal (A0018) has 1 of 4 monthly guest visits left - this booking needs 2." the host has used up the monthly guest allowance of their Membership Type.
- If you see "Key in the booker's member number." or "Key in the visitor's name." the Booker section is incomplete.
- If the booking checks read "Key the member number and press Check to resolve the standing and the booking window." click **Check** so that the window, the slots-per-day limit and the guest allowance are shown before you confirm.
- If you see "Participant 2: key in the member number.", "Participant 2: key in the guest's name." or "Participant 2: pick a participant type." that line is incomplete.
- If you see "Configure the Booking No. numbering scheme first (Facility Management - Numbering Control)." or "The Booking No. scheme is manual - key in a booking number." set up the Booking No. series on Numbering Control so that numbers are issued automatically; this screen has no box for a manual number.
- If you see "The roster is frozen once a slot is checked in." the participants can no longer be changed because the booking has been checked in at the Control Station.
- If you see "You are not allowed to amend this booking." or "You are not allowed to amend this bill." the record lies outside your role's data scope.
- If you see "This booking is already cancelled." someone else cancelled it meanwhile; move to another date and back to reload the list.
- If you see "Cancellation is refused inside the 24-hour notice (the deadline was 2026-11-13 09:00) - cancel with a waived charge if the club allows it." use **Cancel and waive charge** with a reason.
- If you see "Give the reason for waiving the charge." or "Give a reason for waiving the late cancellation charge." the **Why the charge is waived** box is empty.
- If the cancel message ends "Late cancellation charge raised but not posted: ..." the booking is cancelled but the charge could not reach the account; follow it up on the No-show Charges screen.
- If you see "Booking FB-000124 is pending-approval - only a booked booking is billed." wait for the approval before opening a bill.
- If you see "'COURT' has no price card in force on 2026-11-14 - set up its pricing first." or "'COURT' has no price for member / weekday / Morning on 2026-11-14 - add that cell to its price card." the fee has no price for that day, participant type or session; complete its price card on Transaction Types, then open the bill again.
- If you see "Configure the Bill No. numbering scheme first (Facility Management - Numbering Control)." or "The Bill No. scheme is manual - key in a bill number." set up the Bill No. series on Numbering Control so that numbers are issued automatically.
- If you see "Bill FBL-00012 is settled." or "Bill FBL-00012 is voided." the bill is closed and can no longer be changed.
- If you see "This item's price cannot be amended at billing." the item is not set to allow a price change on Transaction Types.
- If you see "Quantity must be between 1 and 999." correct the quantity on the line.
- If you see "Every payment line needs a payment type." or "Payment 1: pick a payment type." choose a payment type on each line.
- If you see "Payments must equal the bill total." or "Payments (50.00) must equal the bill total (53.00)." adjust the amounts until Remaining shows 0.00.
- If you see "Pick the Other Debtor to charge on the Debtor payment line." choose the account in the Charge to Other Debtor box.
- If you see "Charge to member account needs a member booker." the bill belongs to a visitor; use another payment type or a Debtor class type.
- If you see "Member A0018 (Defaulter) is barred from charging to account." the member's status forbids charging; take another payment type or resolve the status under Membership.
- If you see "Credit limit exceeded for this debtor." the account has no credit left; take another payment type, or ask the office to review the credit limit.
- If you see "Open an AR invoice transaction type to the Facility module first (AR - Transaction Type)." or "Several AR transaction types are opened to Facility - keep exactly one so charges post unambiguously." Account Receivable must have exactly one invoice transaction type opened to Facility before any bill can be charged to an account.
- The system asks "Discard this booking?" when you leave the drawer with unsaved details; **Keep editing** returns you to where you were.
- The list shows one facility type and one date at a time, so a booking that seems to be missing is usually on another date or type; use the search box.

## Related options

- Facility Management → Facility Types - the booking mode, slot sets, slots-per-day and consecutive-slot limits, participant limits, guest policy, default fees and the approval switch.
- Facility Management → Facilities - the courts and halls that make up the columns of the grid.
- Facility Management → Facility Closures - closed days and times, shown as Closed on the grid.
- Facility Management → Facility Specification - the booking window, same-day booking, Booking Lock (minutes), guest control, and the cancellation notice and no-show rules.
- Facility Management → Participant Types - the participant types offered on each line and which of them need approval.
- Facility Management → Transaction Types - the billing items, their price cards and whether a price may be changed at billing.
- Facility Management → Payment Types - the payment types and their classes used when settling.
- Facility Management → Numbering Control - the Booking No. and Bill No. series.
- Facility Management → Control Station - checks in booked slots, records no-shows, and opens the bills of entries, Utility Items and classes in this screen's bill drawer.
- Facility Management → No-show Charges - follow-up of the late cancellation charges raised here.
- Facility Management → Booking Suspensions - members who may not book for a period.
- System Setup → Workflow Setup - the approval chain for the purpose Facility booking.
- Membership Management → Membership Type - the monthly guest allowance and the advance booking days of a membership type.
- Account Receivable → Transaction Type - the invoice type opened to Facility that account charges post with.
- Account Receivable → Debtor Listing - the Other Debtor accounts offered on a Debtor class payment line.
