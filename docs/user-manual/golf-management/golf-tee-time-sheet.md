# Tee Time Sheet

> **Where:** Golf Management → Front Desk → Tee Time Sheet
>
> **Who can use it:** users whose role includes the Golf Management module.

## What this option is for

The Tee Time Sheet is the Front Desk's working view of one play day: every course on its own card, every flight time with a coloured dot per player, so staff see at a glance who is booked, who has registered, who has an open bill and who has settled.
From a flight, staff register arriving golfers (booked or walk-in), open each player's bill, add items from the billing tiles, settle with one or more tenders, and - once tee times have passed - record the players who never turned up.
Bookings are made elsewhere (Golf Booking); this screen is where the day actually happens.

## The screen at a glance

[Screenshot: Tee Time Sheet with two course cards]

- **Play date** picks the day; today is selected by default.
- The search box highlights the flights holding a matching golfer (name, member no, booking no or registration no) and dims the rest; the first match scrolls into view.
- **No-shows** (today and past dates only) opens the review of booked players who did not register.
- A legend shows the four dot colours (set on Golf Specification): **Booked**, **Registered**, **Billed**, **Settled**; a blank outline is an available seat.
- One card per course, headed by the course code, description and its nine rotation (e.g. "E1 → E2"); click the header to fold or unfold the card.
- Each flight row shows the tee time, one dot per seat, the players (name, type, member no, holes) and tags: **CLOSED** (course closure), **X-OVER** (a crossover-only time - no new tee-offs), **OFF GRID** (players on a time no longer in the tee-time set), **9H only** (18 holes not possible from here) and **↷n** (n players crossing over onto this nine at this time).
- Clicking a flight opens the flight workspace in a drawer; closed and crossover-only rows do not open.
- The **Walk-in** button at the bottom right registers a golfer on any free flight.

## Common tasks

### Register booked players

[Screenshot: Flight workspace with booked players selected]

1. Click the flight; the drawer lists every seat - booked players carry a tick box, pre-selected.
2. Untick anyone who has not arrived yet.
3. Click **Register selected (n)**.

Each player receives a Registration No. and their dot turns to the Registered colour.
The system re-checks the member's standing (a barred member is skipped with the reason) and shows warnings - handicap rule, course closure, junior rule - without blocking the desk.
A name-only guest on a booking is registered as a guest; their identity can be completed later.

### Register a walk-in

[Screenshot: Walk-in registration dialog]

Two ways:

- From a flight with a free seat: click **+ Add walk-in** in the free slot, pick the **Player Type** and **No of Holes**, enter the **Member No** (member or member-as-guest) or the **Guest Name** with optional **Identity / Passport No.** and **Mobile**, then click **Register walk-in**.
- From the **Walk-in** button: additionally pick the **Course** and **Flight Time**.

A walk-in takes a seat only on a flight that is on the tee sheet, open for new tee-offs (not crossover-only, not closed) and not full; an 18-hole walk-in also needs a free, open crossover flight.
Returning guests are matched by identity number, then mobile, so one guest profile is kept.

### Bill a player

[Screenshot: Bill drawer with items and tiles]

1. In the flight workspace click **Bill** on a registered player (or **View** on a settled one).
2. A new bill auto-charges the green fee for the player's category (members with golfing right pay none); any missing price shows as a warning.
3. Click a **tile** to add an item: matrix items price by holes and day type, flat items by their amount, packages explode into their element lines plus the balance line.
   Tiles the player's category may not be billed are not shown; a package the player does not qualify for is greyed out with the reason.
4. Adjust **Qty** (1-99) on a line; the **Price** can be changed only when the item allows a manual price (the line is then tagged "amended"); the red cross removes a line (package lines go together).
5. Watch **Tax** and **Total** at the bottom, then click **Settle…**.

**« Back** returns to the flight; a bill with no items cannot be settled.

### Settle a bill

[Screenshot: Settle view with two payment lines]

1. Click **Add payment** for each tender: pick the **payment type**, enter the **amount** and an optional **reference** (card slip, voucher no).
2. The **Remaining** figure must reach 0.00 - payments must equal the bill total exactly.
3. Click **Settle bill**.

A **Member**-class payment charges the amount to the member's own account (one invoice posts to Account Receivable; the member must be allowed to charge to account and have a ledger account); cash-like tenders simply record the payment.
A settled bill shows its payments and can only be viewed.

### Cancel a registration or void a bill

- In the flight workspace, open the player's ⋮ menu and click **Cancel registration** (a registration without a bill) or **Void bill** (an open bill).
- Confirm in the drawer with an optional **Reason**.

Cancelling a booked player's registration puts them back to Booked - the booking keeps the seat; cancelling a walk-in frees the seat.
Voiding a bill discards its items; the registration stays, and a new bill can be opened.
A registration with a bill must have the bill voided first.

### Record no-shows

[Screenshot: No-shows review]

1. On today or a past date click **No-shows**; the review lists every booking with players still booked whose tee time has passed, grouped by booking with the booker.
2. With the Cancellation & No-show rule on, each booking shows the charge to the booker; untick **Record booking ... as no-show** to leave a booking out, or tick **Waive the charge** and give the reason.
3. Click **Record n no-shows · charge x.xx**.

The players are recorded as no-shows and each charge posts to the booker's account (or waits as Pending on the No-show Charges screen when it cannot post - for example a non-member booker).
With the rule off, no-shows are recorded without charges.

## Field reference

### Walk-in registration (free slot or Walk-in button)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Course** | Walk-in button: Yes | The course the golfer tees off on. | Type to search the course list. |
| **Flight Time** | Walk-in button: Yes | The tee time, picked from the time control. | Must be a time on the course's tee sheet for the day, open to new tee-offs and not full. |
| **No of Holes** | Yes | 9 or 18 holes. | 18 holes needs a free crossover flight; a "9H only" flight offers 9 only. |
| **Player Type** | Yes | Member, Member as Guest or Guest. | Decides the green fee category and which tiles the bill shows. |
| **Member No** | Member / Member as Guest: Yes | The member's number, e.g. `A0018`. | The member must exist; a barred member cannot register. |
| **Guest Name** | Guest: Yes | The visitor's name. | Up to 100 characters. |
| **Identity / Passport No.** | No | Used to recognise a returning guest. | Up to 50 characters. |
| **Mobile** | No | Also used to recognise a returning guest. | Up to 30 characters. |

### Bill line

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Qty** | Yes | How many of the item. | 1-99; package lines are fixed. |
| **Price** | - | The unit price. | Editable only when the item allows a manual price; 0.00 or more. |

### Settle - payment line

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Payment type** | Yes | The tender, from the Payment Type catalog. | Debtor-class tenders are not supported yet. |
| **Amount** | Yes | The amount paid with this tender. | More than 0.00; all lines must total the bill exactly; up to 10 lines. |
| **Reference** | No | A slip, voucher or approval number. | Up to 100 characters. |

### Confirm (cancel registration / void bill)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | No | Why the registration is cancelled or the bill voided. | Kept on the record. |

## Tips & troubleshooting

- If you see "No tee sheet is configured for this course on that date", the course has no tee-time set covering the day - see Course Setup.
- If you see "That flight time is closed for crossover - no new tee-offs", "That flight is blocked by a course closure" or "That flight is full", pick another flight.
- If you see "No crossover flight remains for 18 holes at that time" or "The crossover nine is closed at ...", register the walk-in for 9 holes.
- If you see "Configure the Registration No. (or Bill No.) numbering scheme first", set the series under Numbering Control.
- If you see "<name> is already registered (R...)", the player was registered in the meantime - reload the day.
- If you see "Bill G... exists for this registration - void it first", void the bill before cancelling the registration.
- If you see "'BUGGY-V' is the Guest / Visitor item - this player is billed as Member", the tile belongs to another golfer category - use that category's item.
- If you see "'PKG-JR' - Age 18 and under", the golfer does not qualify for the package; the greyed tile shows the same reason.
- If you see "Payments (x) must equal the bill total (y)", adjust the amounts until Remaining reads 0.00.
- If you see "Charge to member account needs a member bill", "Member ... is barred from charging to account", "Open an AR invoice transaction type to the Golf module first" or "Several AR transaction types are opened to Golf", the Member tender cannot post - settle with another tender or fix the setup.
- "This bill is settled and cannot be amended" - a settled bill is final; corrections go through Account Receivable.
- Leaving the drawer scrolls the flight you were working on back into view.

## Related options

- Golf Management → Golf Booking - the bookings that appear as booked players here.
- Golf Management → Front Desk → No-show Charges - follow-up of the charges raised by the No-shows review.
- Golf Management → Common Setup → Transaction Type - the billing tiles, prices, golfer-type defaults and package eligibility.
- Golf Management → Common Setup → Payment Type - the tenders offered at settlement.
- Golf Management → Common Setup → Golf Specification - the dot colours, the handicap / junior warnings and the Cancellation & No-show rule.
- Golf Management → Common Setup → Course Closure - closed flights.
- Golf Management → Common Setup → Numbering Control - the Registration No. and Bill No. series.
