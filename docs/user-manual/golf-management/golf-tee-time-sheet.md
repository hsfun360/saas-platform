# Tee Time Sheet

> **Where:** Golf Management → Front Desk → Tee Time Sheet
>
> **Who can use it:** users whose role includes the Golf Management module.

## What this option is for

The Tee Time Sheet is the Front Desk's working view of one play day: every course on its own card, every flight time with a coloured dot per player, so staff see at a glance who is booked, who has registered, who has an open bill and who has settled.
From a flight, staff register arriving golfers (booked or walk-in), open each player's bill, add items from the billing tiles, settle with one or more tenders (a golfer's open rain check among them), issue a rain check when a paid round is abandoned, and - once tee times have passed - record the players who never turned up.
Bookings are made elsewhere (Golf Booking); this screen is where the day actually happens.

## The screen at a glance

[Screenshot: Tee Time Sheet with two course cards]

- **Play date** picks the day; today is selected by default.
- The search box highlights the flights holding a matching golfer (name, member no, booking no or registration no) and dims the rest; the first match scrolls into view.
- **No-shows** (today and past dates only) opens the review of booked players who did not register.
- A legend shows the four dot colours (set on Golf Specification): **Booked**, **Registered**, **Billed**, **Settled**, plus **Available** for the blank outline of a free seat.
- One card per course, headed by the course code, description and its nine rotation (e.g. "E1 → E2"); click the header to fold or unfold the card.
  A course that has no tee-time set covering the day but still carries a group hold is shown with a **not operating** tag.
  When no course operates at all on the chosen date, the screen says so instead of showing cards.
- Each flight row shows the tee time, one dot per seat, the players (name, type, member no, holes) and tags: **CLOSED** (course closure), **HELD · <group>** (a group's shotgun window; while the group is not yet confirmed the tag names its state as well, for example **HELD · TENTATIVE · <group>**, **HELD · PENDING · <group>** or **HELD · APPROVED · <group>**), **RESERVED · <group>** (a group's flight with no players drawn yet; its seats show as dashed dots), **X-OVER** (a crossover-only time - no new tee-offs), **OFF GRID** (players on a time no longer in the tee-time set), **9H only** (18 holes not possible from here) and **↷n** (n players crossing over onto this nine at this time).
  Hovering a dot names its state ("Reserved for <group>" on a dashed dot).
- A group or tournament play day on the course shows as a block above the flight rows: the group name, booking number, a hold-state chip (**TENTATIVE**, **PENDING** or **APPROVED**) while the booking is not yet confirmed, then the start format, holes, the held window, and the drawn / registered / settled counts.
  On the right the block shows **Register group (n)** for a confirmed group with players still to register, **All registered** once they all are, **No players drawn yet** when the draw is empty, or **Not confirmed yet** for a group that is still tentative, pending approval or awaiting its deposit.
  A shotgun-format day lists its flights inside the block by hole and nine; a flight with no players drawn is greyed out and does not open.
  A traditional or two-tee day keeps its players in the normal rows, tagged with the group name and flight label.
- Clicking a flight opens the flight workspace in a drawer titled with the course code and tee time (a group flight is titled with the group name and flight label); closed and crossover-only rows do not open.
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
A booking still awaiting the club's approval (a player type that needs approval is on it) shows "awaiting approval" on its lines with a blank dot instead of a tick box; its players register once the booking is approved.

### Register a group

[Screenshot: Group block with Register group]

1. In the group's block, click **Register group (n)** - n is the number of drawn players not yet registered.
   The button is offered only once the group booking is **Confirmed**; a block that reads **Not confirmed yet** belongs to a booking that is still tentative, pending approval or awaiting its deposit, and its players register once it confirms on Group Bookings.
2. Read the result: how many were registered and who was skipped, with the reason.

Every drawn player of the group on that date is registered in one go, whichever flight or nine they are in.
A shotgun flight in the block opens the same flight workspace as any flight: register a selection, bill a player, cancel a registration or void a bill.
A group player's own bill opens empty - the package is billed on the group's folio under Group Bookings - so it only carries the player's extras, such as a buggy or caddy, settled with the usual tenders.

### Register a walk-in

[Screenshot: Walk-in registration dialog]

Two ways:

- From a flight with a free seat: click **+ Add walk-in** in the first free slot (the other free seats read **Available**), pick the **Player Type** and **No of Holes**, enter the **Member No** (member or member-as-guest) or the **Guest Name** with optional **Identity / Passport No.** and **Mobile** (pick the country code, then type the number), then click **Register walk-in**.
- From the **Walk-in** button: the **Walk-in registration** drawer additionally asks for the **Course** and **Flight Time**.

A walk-in takes a seat only on a flight that is on the tee sheet, open for new tee-offs (not crossover-only, not closed) and not full; an 18-hole walk-in also needs a free, open crossover flight.
Returning guests are matched by identity number, then mobile, so one guest profile is kept.

### Bill a player

[Screenshot: Bill drawer with items and tiles]

1. In the flight workspace click **Bill** on a registered player (or **View** on a settled one).
   The drawer is titled **Bill <bill no.>** and carries an **OPEN** or **SETTLED** chip beside the player's name and bill date.
2. A new bill auto-charges the green fee for the player's category (members with golfing right pay none); any missing price shows as a warning.
   On a course marked **Buggy compulsory** (Courses) the buggy fee is auto-charged too: players paired in seat order across the flight take the **shared buggy** fee, an odd player the **single buggy** fee - swap the line from the tiles if two players will not share.
   The Buggy Station issues one buggy per slot those fee lines define, once the bill is settled.
3. Click a **tile** to add an item: matrix items price by holes and day type, flat items by their amount, packages explode into their element lines plus the balance line.
   Tiles the player's category may not be billed are not shown; a package the player does not qualify for is greyed out with the reason.
4. Adjust **Qty** (1-99) on a line; the **Price** can be changed only when the item allows a manual price (the line is then tagged "amended"); the red cross removes a line (package lines go together).
5. Watch **Tax** and **Total** at the bottom, then click **Settle…**.

**« Back** returns to the flight; a bill with no items cannot be settled.

### Settle a bill

[Screenshot: Settle view with two payment lines]

1. The drawer switches to **Settle bill <bill no.>**; click **Add payment** for each tender: pick the **payment type**, enter the **amount** and an optional **reference** (card slip, voucher no).
2. The **Remaining** figure must reach 0.00 - payments must equal the bill total exactly.
3. Click **Settle bill**.

A **Member**-class payment charges the amount to the member's own account (one invoice posts to Account Receivable; the member must be allowed to charge to account and have a ledger account); cash-like tenders simply record the payment.
A **Debtor**-class payment charges the amount to an Account Receivable **Other Debtor** - a corporate, travel agent or society Finance keeps in the city ledger: pick the account on the line (a player of a group booking billed to an Other Debtor has that party offered first), and one invoice posts to that account with its credit limit enforced.
A settled bill shows its payments and can only be viewed.

### Redeem a rain check

1. In the Settle view pick a payment type of class **Rain Check** on a line; the reference box becomes a **rain check** picker listing this golfer's open rain checks (number, value, valid until).
2. Pick the rain check; the line's amount fills with what it can cover - its value, capped at what the other lines leave.
   A note under the line says whether the rain check is used in full or how much is forfeited.
3. Add other tenders for any remainder until **Remaining** reads 0.00, then click **Settle bill**.

A rain check is single use: once redeemed, any value above the line is forfeited and recorded on the rain check.
Only the golfer it was issued to can redeem it, and only while it is issued and within its validity.

### Issue a rain check

[Screenshot: Issue rain check view]

1. With rain checks switched on in Golf Specification, open the flight workspace, find a registered player whose bill is **settled**, open the ⋮ menu and click **Issue rain check**.
2. The drawer switches to **Issue rain check · <player>**: enter the **Holes played** before play stopped (0 to the holes registered); the quote box underneath restates the basis (green-fee lines or the whole bill), the computed value, the rain check value and the valid-until date, and the footer button names the amount, e.g. **Issue rain check 60.00**.
3. Optionally lower the **Amount** (leave it blank for the computed value - you cannot raise it) and type the **Reason**.
4. Click **Issue rain check <amount>**.

The rain check is numbered from the Rain Check No. series, the player's row shows "rain check RC... (60.00)", and the golfer receives an email with the number, value and expiry when an address is on record.
One rain check per settled bill; the ⋮ item disappears once it is issued.

### Receive a visiting affiliate member

1. A player whose booking belongs to a confirmed affiliated visit is tagged "visit V... (not yet received)" and shows **Receive** instead of the register tick box.
2. Click **Receive**; the drawer switches to **Receive visitor**: tick **Letter of introduction sighted** and **Home club membership card and passport or ID sighted**, then click **Record arrival** (greyed until both are ticked).
3. Register the party as usual; registering before the arrival is recorded is refused with the visit number.

Billing and settlement follow the normal flow; the visitor is billed at their home club's player type.

### Request a caddy by name

[Screenshot: Request caddy view]

1. With caddy management switched on in Golf Specification, open the flight workspace, open the ⋮ menu of a booked or registered golfer who has no caddy yet and click **Request caddy**.
2. The drawer switches to **Request caddy · <player>**: pick the **Caddy** (type the badge number or name; caddies on leave today, inactive or blacklisted are not listed, and one already requested today is counted but not offered) and add **Remarks** such as the language wanted.
3. Click **Request caddy**.
   The golfer's line reads "caddy C-001 Ali requested", then "confirmed" once the caddy has checked in at the Caddy Station, and the station assigns that caddy to the golfer by name.

A request made on the Golf Booking screen for the whole flight shows on every line of that booking with "(flight)"; a golfer of that flight may still ask for a different caddy of their own.
To withdraw a request, open the golfer's ⋮ menu and click **Cancel caddy request C-001** (marked "(flight)" when it is the booking's request), add an optional reason and confirm; a request the caddy cannot honour is cancelled at the Caddy Station.

### Cancel a registration or void a bill

- In the flight workspace, open the player's ⋮ menu and click **Cancel registration** (a registration without a bill) or **Void bill** (an open bill).
- The drawer switches to a view titled **Cancel registration** or **Void bill** that states what happens; add an optional **Reason** and click the red **Cancel registration** / **Void bill** button, or **Keep** to back out.

Cancelling a booked player's registration puts them back to Booked - the booking keeps the seat; cancelling a walk-in frees the seat.
Voiding a bill discards its items; the registration stays, and a new bill can be opened.
A registration with a bill must have the bill voided first.

### Record no-shows

[Screenshot: No-shows review]

1. On today or a past date click **No-shows**; the **No-shows** drawer lists every booking with players still booked whose tee time has passed, grouped by booking with the booker.
   When nothing is outstanding it reads "Nothing to record - every booked player whose tee time has passed is registered or cancelled."
2. With the Cancellation & No-show rule on, each booking shows the charge to the booker (item, quantity × price, tax and total); untick the booking's tick box to leave it out, or tick **Waive the charge** and type the **Waive reason (required)** in the box that appears.
   A non-member booker is flagged "Not a member - recorded as pending for collection at the counter."; a charge that cannot be priced reads "Cannot be charged: <reason> - the no-show is recorded without a charge."
   With the rule off, the header reads "No-show charges are off (Golf Specification)" and no charge lines appear.
3. Click **Record n no-shows · charge x.xx** (the charge part is omitted when nothing is charged).

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
| **Mobile** | No | Also used to recognise a returning guest; pick the country code, then type the number. | Up to 30 characters. |

### Bill line

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Qty** | Yes | How many of the item. | 1-99; package lines are fixed. |
| **Price** | - | The unit price. | Editable only when the item allows a manual price; 0.00 or more. |

### Settle - payment line

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Payment type** | Yes | The tender, from the Payment Type catalog. | Member and Debtor classes post an invoice to Account Receivable. |
| **Amount** | Yes | The amount paid with this tender. | More than 0.00; all lines must total the bill exactly; up to 10 lines; a Rain Check line cannot exceed the rain check's value. |
| **Reference** | No | A slip, voucher or approval number. | Up to 100 characters; not shown on a Rain Check line. |
| **Rain check** | Rain Check class: Yes | One of this golfer's open rain checks. | Each rain check once per settlement; it must belong to the billed golfer and be issued and unexpired. |
| **Charge to** | Debtor class: Yes | The Other Debtor account the line charges. | Active Other Debtors of Account Receivable; the account must be in the company's base currency, active and within its credit limit. |

### Issue rain check

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Holes played** | Yes | Holes completed before play was abandoned. | Whole number from 0 to the holes registered (9 or 18). |
| **Amount** | No | A lower value than the computed one. | 0.00 or more; cannot exceed the computed value; blank = the computed value. |
| **Reason** | No | Why play was abandoned. | Up to 255 characters; quoted in the golfer's email. |

### Request caddy

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Caddy** | Yes | The caddy the golfer asks for. | Active caddies not on leave today; one request per caddy per day. |
| **Remarks** | No | Anything the station should know, e.g. `Speaks Mandarin`. | Up to 255 characters. |

### Confirm (cancel registration / void bill / cancel caddy request)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | No | Why the registration is cancelled, the bill voided or the caddy request withdrawn. | Kept on the record. |

### No-shows review (per booking)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Record booking ... as no-show** (tick box) | - | Tick to include the booking in the recording; untick to leave it out this time. | Ticked by default. |
| **Waive the charge** | No | Tick to record the no-show without charging the booker. | Shown only while the no-show rule is on and the charge could be priced. |
| **Waive reason (required)** | Yes when waiving | Why the charge is waived. | Up to 255 characters; kept on the charge record. |

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
- If you see "Payment n: pick the Other Debtor to charge.", a Debtor-class line needs its account.
- If you see "Payment n: Other Debtor not found or inactive.", "No ledger account exists for this debtor", "Debtor account is closed", "Credit limit exceeded." or "This ledger account is in USD; producer charges post in MYR only", the Debtor tender cannot post - settle with another tender or ask Finance to fix the account.
- "This bill is settled and cannot be amended" - a settled bill is final; corrections go through Account Receivable.
- If you see "Rain checks are switched off on Golf Specification.", turn on the Rain Checks section there first.
- If you see "A rain check needs a SETTLED bill - the round must have been paid for.", settle the player's bill before issuing.
- If you see "Rain check RC... was already issued for bill G...", the round already has its rain check - see the Rain Checks screen.
- If you see "Bill G... has no green-fee line to credit.", the bill carries no green fee and the value basis is green-fee lines; change the basis on Golf Specification or there is nothing to credit.
- If you see "The rain check amount cannot exceed the computed value ...", lower the amount or leave it blank.
- If you see "Configure the Rain Check No. numbering scheme first", set the series under Numbering Control.
- If you see "Payment n: rain check RC... belongs to <name>, not to the billed golfer." or "Payment n: rain check RC... is redeemed", pick one of this golfer's own open rain checks or another tender.
- If you see "Pick the rain check to redeem on the Rain Check payment line.", choose a rain check on that line or change its payment type.
- If you see "Visit V...: record Tan Wei Ming's arrival first (letter of introduction and ID sighted).", click **Receive** on that line before registering.
- If you see "Tick that the letter of introduction was sighted." or "Tick that the home club card and ID were sighted.", both checks are required to record the arrival.
- If you see "E1 is buggy-compulsory but no active shared buggy fee is the default for 'member' - buggy fee not auto-charged.", set up the single and shared buggy fee items for that golfer type under Transaction Type.
- A player's line reads "buggy B-012" once the Buggy Station has issued a unit to them ("(returned)" after it comes back), and "caddy C-001 Ali" once the Caddy Station has assigned a caddy ("(done)" after the round); before that it reads "caddy C-001 Ali requested" or "confirmed" while a named request is open.
- If you see "Caddy C-001 is already requested on <date> (10:00) - one request per caddy per day.", another flight holds that caddy today; pick another.
- If you see "Caddy C-003 is on sick leave on <date>." or "Caddy management is switched off (Golf Specification).", pick another caddy or switch the Caddies section on there.
- Leaving the drawer scrolls the flight you were working on back into view.

## Related options

- Golf Management → Golf Booking - the bookings that appear as booked players here.
- Golf Management → Front Desk → No-show Charges - follow-up of the charges raised by the No-shows review.
- Golf Management → Front Desk → Rain Checks - every rain check issued here, with its redemption, expiry or cancellation.
- Golf Management → Front Desk → Buggy Station - issues the buggies against the buggy fees paid here.
- Golf Management → Front Desk → Caddy Station - assigns the caddies against the caddy fees paid here and honours the caddy requests made here.
- Membership Management → Affiliated Visits - the letters of introduction whose visitors are received here.
- Golf Management → Common Setup → Transaction Type - the billing tiles, prices, golfer-type defaults and package eligibility.
- Golf Management → Common Setup → Payment Type - the tenders offered at settlement.
- Golf Management → Common Setup → Golf Specification - the dot colours, the handicap / junior warnings and the Cancellation & No-show rule.
- Golf Management → Common Setup → Course Closure - closed flights.
- Golf Management → Common Setup → Numbering Control - the Registration No. and Bill No. series.
