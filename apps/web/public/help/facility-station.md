# Control Station

> **Where:** Facility Management → Control Station
>
> **Who can use it:** users whose role includes the Facility Management module.
>
> **Permissions:** the scan box (and so the whole Serve panel), **Register**, **Issue** / **Record use**, **Add guest** and **Added by mistake - remove** need the Create permission on this screen.
> **Check in**, **No show**, **Sign out**, **Guests**, **Return**, **Undo** and **End of day** need the Edit permission.
> A button you have no permission for is simply not shown.

## What this option is for

The Control Station is the desk's working screen for one day.
It starts from the person in front of you: scan a guest's pass or key a member number, and one panel opens where a tap hands out a locker, a towel or a shower, and a tap admits the person to the gym or the pool.
Below the scan box, a strip of chips shows the whole day: the booked courts to check in, who is inside each facility against its capacity, every Utility Item that is out, and the day's classes.
A Facility is a place that is booked by slot or entered on registration (a court, the gym, the pool); a locker, a towel or a shower is a Utility Item, and the numbered pieces of a Utility Item are its units.
A guest's pass is the day pass from Membership's Guest Registrations.
Fees charged here go on an open bill that is settled in the bill drawer of the Facility Bookings screen.

## The screen at a glance

[Screenshot: Control Station with the scan box, the day strip and a locker unit board]

- **The scan box** sits at the top, on today's date only: "Scan a guest pass or key a member number", a camera button and **Serve**.
  A handheld scanner types the pass into the box and presses Enter for you; on a desk computer the box takes the cursor by itself whenever no form is open.
- **The day line** shows the club's clock ("club time", the weekday, and whether the day is a weekday or a weekend), the date picker with **Today** and a refresh button, and the totals: "12 inside" across all facilities and, in red, "2 overdue" when Utility Items are past their due time.
  The screen refreshes itself every minute while no form is open, because the club clock opens and closes the check-ins.
  Pick another date to look at that day; the scan box is hidden and **Issue** / **Record use** are greyed on any date but today.
- **The strip** holds one chip per facility type and per Utility Item; click a chip to see its day view.
  A slot type (courts) shows "3 slots"; an entry type (gym, pool) shows "12 / 40 in"; a numbered Utility Item shows "18 free"; a counted one shows "5 out"; a use-only one shows "7 today".
  When the club runs classes, a **CLASSES** chip shows the number of sessions.
  The screen reopens on the chip you last used on this device.
  A line above each view names what you are looking at: for a facility type its opening hours ("Open 07:00 to 22:00", with "closed now" when it is shut, or "Open all day"), for a Utility Item its limit per person and when it is due back.
- **A slot type** lists the day's booked slots with a chip: **Not yet** (too early to check in), **Open**, **Closed** (the slot has ended) or **Checked in**.
- **An entry type** shows "12 of 40 inside" with a bar, the **Register** button, the people who are **In** (with **Sign out**, **Guests** and **Bill**) and below them the people who are **Out**.
  Each row shows the member, the registration number, the time in and the guests; an entry whose guests went in before the member reads "guests only, the member is not inside".
- **A numbered Utility Item** shows its unit board with a legend: **Available**, **Issued**, **Out of service** (a parked unit reads "parked", a unit switched off in setup reads "inactive").
  **A counted Utility Item** shows "5 of 60 TOWEL out" with an **Issue** button; **a use-only Utility Item** shows "7 SHOWER used today" with a **Record use** button.
  Under each are the lists **Out now** and **Returned today** (or **Used today**); every row names the holder, for example "L003 · Tan Wei Ming guest of Ahmad Faizal (A0018)", and carries an **Overdue** chip when it is past its due time.
- **End of day** sits at the bottom of an entry type's view (and of a slot type's view when no-show control is on).
- Every form on this screen opens in one drawer on the right; green and red messages appear at the bottom of the screen and can be dismissed.
- If nothing is set up yet the screen says "Nothing to run yet. Set the facility types up under Facility Types and what the station hands out under Utility Items, and the station fills itself."

## Common tasks

### Serve a guest who holds a pass

[Screenshot: Serve panel of a guest with Holding now, Tap to issue and Enter a facility]

1. Scan the QR code on the guest's pass with the handheld scanner.
   On a tablet or phone, click the camera button, point the camera at the code, and the pass is read; you can also paste the pass link into the box and click **Serve**.
2. The panel **Serve Tan Wei Ming** opens.
   The top block reads "Guest of Ahmad Faizal (A0018) · pass GR00001 · valid today" and, once arrived, "Arrived" with the time.
   The first scan of the day marks the guest as arrived and shows "Tan Wei Ming arrived - guest of Ahmad Faizal (A0018)."
3. Under **Tap to issue**, read the price on the tile before you tap: "Free", "5.00 before tax, on Ahmad Faizal's bill", or the fee code with "no price today".
4. Tap what the guest takes:
   - a numbered item (LOCKER) shows its free units, the first marked "next free" - tap a unit to issue that unit; **Show all 40 free units** lists the rest when more than twelve are free;
   - a counted item (TOWEL) has one button, **Issue 1 TOWEL** - each tap issues one piece, and "holding 1 of 2" beside it counts against the limit;
   - a use-only item (SHOWER) has **Record SHOWER use**, with "used 1 of 1 today" beside it.
5. The item moves to **Holding now** (a use goes to **Used today**) and the message confirms it, for example "L003 issued to Tan Wei Ming, guest of Ahmad Faizal."
   Each row shows when it was issued, when it is due back, its bill, and an **Overdue** chip once it is late.
6. Click **Done**, or scan the next person straight away in the "Next person: scan a pass or key a member number" field at the top of the panel (shown on a desk computer with a keyboard and mouse).

The member does not need to be at the counter: the pass alone serves the guest, and the member named on the pass is responsible for the fees.
A tile that cannot be tapped says why in place of its button - see Tips & troubleshooting for each reason.

### Serve a member

1. Key the member number in the scan box, for example `A0018`, and press Enter or click **Serve**.
2. The panel reads "Member A0018" with a **Member** chip.
   If the member's status carries a warning, a note shows under the name: "Member A0018 is" followed by the status.
   A barred member is refused and no panel opens.
3. Tap the items the member takes, exactly as for a guest; the tile price reads "5.00 before tax".
4. The **Guests** section lists every guest of this member today; click a guest's button (for example "Tan Wei Ming - holding 1") to serve that guest without scanning.

A member who comes as another member's guest is served on their own member number, as a member.

### Add a guest who has no pass

[Screenshot: Add a guest form with the outcome line and the Register and serve button]

A guest without a pass is served only while the member is at the counter.

1. Open the member's panel (key the member number) and click **Add guest**.
2. Enter the **Guest name**, and a **Mobile** or an **Email** when the guest gives one.
3. Read the note under the fields: it says what will happen before you press the button.
   - With a mobile or an email: "The guest is registered and gets a day pass: with it they come back to the station on their own today. The visit counts once on Ahmad Faizal's monthly guest allowance."
   - With a name only: "With a name only the guest gets no pass: every later item again needs Ahmad Faizal at the counter. A mobile or an email gives them a pass."
   - When the club issues no passes at the station: "The guest is served by name, together with Ahmad Faizal - the club issues no passes at the station."
   - When the club insists on a contact: "The club registers every guest at the station: key in a mobile number or an email." and the button stays greyed until you do.
4. Click **Register and serve** (the guest gets a pass) or **Serve by name** (no pass); **Back** returns to the member with nothing added.
5. The panel now serves the guest: tap their items as usual.

A guest served by name reads "no pass - served by name, with the member" and is found again through the member's **Guests** list.
Such a guest uses one visit of the member's monthly guest allowance, taken with their first item or entry of the day.

### Hand the pass to a guest

1. Right after **Register and serve**, the pass block shows the QR code and "Pass GR00002 - hand it to Siti Aminah".
   Later, open the guest's panel and click **Hand over the pass** to show it again.
2. Let the guest scan the QR code with their phone, or send it:
   - **Share via WhatsApp** (shown when the guest gave a mobile) opens WhatsApp with the message ready and records the share;
   - **Email the pass** (shown when the guest gave an email) sends it and answers "The pass was emailed to" with the address;
   - **Open pass** opens the pass page itself.
3. The line under the buttons reads "Not sent yet.", "Sent by email." or "Sent by WhatsApp."; **Hide** folds the block away.

To step from a guest back to the member who brought them, click **Serve Ahmad Faizal**.
If you added a guest by mistake, click **Added by mistake - remove** in the guest's panel and confirm **Remove guest**: the pass is cancelled and the visit no longer counts on the member's allowance.
The link is offered only for a pass this station registered, and only while the guest has taken nothing and entered no facility.

### Admit a person to the pool or gym

[Screenshot: Enter a facility tiles, one open with Admit and one showing Inside]

1. Open the person's panel (scan the pass or key the member number) and find **Enter a facility**.
2. Read the tile: the price ("No fee", "10.00 before tax", or "10.00 before tax, on Ahmad Faizal's bill" for a guest) and the count the tap will reach, "13 of 40 inside after this".
   For a guest whose member is not inside, the line adds "Ahmad Faizal is not inside".
3. If the club keeps more than one visitor guest type, pick the guest's type in the list on the tile.
4. Click **Admit to GYM**.
   The message confirms, for example "Ahmad Faizal is in GYM (RG-00004) - 13 of 40 inside." or "Wong Mei Ling, guest of Ahmad Faizal, is in GYM (RG-00005) - 14 of 40 inside."
5. The tile now shows **Inside**, "since" the time and the registration number.

One tap admits one person.
A guest joins the member's entry; when the member is not inside, the guest goes in on an entry in the member's name, and the member joins it later from their own panel ("with the guests already inside").
A wrong admission has no Undo: sign the person out and remove the fee line on the bill.

### Take an item back

- **From the person's panel:** scan the pass or key the member number, and under **Holding now** click **Return** on the row - one tap takes it back in good condition.
  A row still inside its first five minutes shows **Undo** instead; open the row's ⋮ menu and click **Return in good condition**.
- **Damaged or lost:** open the row's ⋮ menu, click **Return damaged or lost**, choose the **Condition**, add **Remarks**, and click **Record return** (**Back** returns to the person with nothing recorded).
- **From the board or the list:** open the Utility Item's chip and tap the issued unit on the board, or click **Return** on a row under **Out now**; the form opens on **Good** - change the condition if needed, enter the **Pieces returned** for a counted item, and click **Record return**.

The message names what came back: "L003 returned." or "TOWEL returned."
A damaged or lost unit is parked: "L003 returned - the unit is out of service until cleared."
Missing pieces read "1 lost - charge it from the bill's tiles if the club bills losses."; the system raises no charge by itself.

### Undo a wrong tap

1. In the person's panel, find the row under **Holding now** or **Used today**.
2. Click **Undo**.

Undo is offered for the first 5 minutes after the tap and only while the bill is not settled; the panel reminds you "Undo is for a wrong tap, in the first 5 minutes."
The item is taken back, its fee line comes off the bill ("Its line is off bill FBL-00013."), and a bill left empty is voided ("Bill FBL-00015 is voided.").
If the system cannot tell which line to remove it says "Its fee stays on bill FBL-00013 - remove the line there."

### Issue a chosen locker from the board

1. Open the numbered Utility Item's chip and tap the free unit the person asked for, for example L003.
2. The line under the scan box changes to "Scan the pass or key the member number of who takes L003."; click **Not this unit** to drop the choice.
3. Scan the pass or key the member number.
4. In the panel, L003 is shown first with the caption "picked"; tap it.

### Issue several pieces at once (the Issue form)

[Screenshot: Issue TOWEL form with Member number, Quantity and the bill line]

1. Open the chip of a counted or use-only Utility Item and click **Issue** (or **Record use**); the button works on today's date only.
2. Enter the **Member number** and, for a counted item, the **Quantity**.
3. Read the lines under the fields: when it is due back and the limit per person, then "A bill is opened for TOWELFEE - 10.00 (5.00 a piece) before tax." or "Free - no bill is opened."
4. Click **Issue** (or **Record use**).

This form issues to a member only; a guest's items are tapped in the guest's panel.
A numbered unit is issued from the panel only.

### Clear a parked unit

1. On the unit board, tap a unit that reads "parked".
2. The system asks "Clear L003?" and explains "L003 is out of service. Clearing it makes it available to issue again."
3. Click **Clear unit** (or **Keep parked**); the answer is "L003 is available again."

### Check in a booked court

[Screenshot: Check in form with the participants ticked]

1. Open the slot type's chip and find the slot; it must show the **Open** chip.
   A slot opens for check-in a set number of minutes before its start (Facility Specification) and stays open until it ends.
2. Click **Check in**.
3. Every participant is ticked as arrived; untick a guest who did not come.
   The host's line cannot be unticked.
   An unticked guest is dropped from the booking and the visit is returned to the host's guest allowance.
4. Click **Check in**; the answer is, for example, "BADMINTON 08:00 checked in - registration RG-00012."

The card then shows **Checked in** with the time and the registration number.
A slot that is not open for check-in (and is not waiting for a no-show mark) carries a **Bill** button, or **Open bill** when the booking has no bill yet; it opens the booking's bill.

### Record a no-show

1. With no-show control on, a booked slot that passed its start time plus the grace period shows a red **No show** button.
2. Click it and read the confirmation: the slot is marked no-show, the charge is raised to the booker's account (a visitor's charge stays pending for the desk), and the strike is counted where the facility type counts them.
3. Click **Record no-show** (or **Not yet**).

The answer counts what was done, for example "1 slot recorded as no-show on 1 booking. 1 charge posted."

### Register a member at the door (the form)

[Screenshot: Register on GYM form with one guest line]

Use the form when a member arrives with several guests, brings a member as a guest, or enters one particular facility of the type; for one person at a time the panel's **Admit** is quicker.

1. Open the entry type's chip and click **Register**; it is greyed while the type is closed.
2. Enter the **Member number**.
3. When the type has more than one facility, pick the **Facility**, or leave "Any (the type's capacity)".
4. Click **Add guest** for each guest: pick the **Type**, then enter the **Guest name** (a visitor) or the **Member No** (a member coming as a guest).
   A visitor's **Mobile** or **Email** registers the guest: they get a day pass and the visit counts once.
5. Add **Remarks** if needed and read the line at the bottom: how many are inside now, whether entry needs a booking today, and that the entry fee and guest fees are billed at registration.
6. Click the footer button, which names the outcome: **Register** or **Register + 2 guests**.

The answer is, for example, "Ahmad Faizal registered on GYM with 2 guests - RG-00005.", followed by any warning.

### Change the guests of an entry

1. On the entry type's register, click **Guests** on the member's row.
2. Add, change or remove guest lines; a line that reads "On a guest pass - counted once today." keeps its pass and its name cannot be edited.
3. Click **Save 2 guests**.

The visits on the member's monthly allowance are re-recorded to match.
A guest who still holds an item cannot be taken off the entry until the item is back.

### Take a walk-in into a class

1. Click the **CLASSES** chip and click **Roster** on the session.
2. While the session is **Scheduled**, click **Walk-in**, choose **Member** or **Visitor** (when the class takes visitors), enter the **Member number** or the **Visitor's name**, and click **Enrol**.
   When the session is full the button is **Join waitlist**; a class that takes no walk-ins says "No walk-ins on this class - enrol from the Class Schedule."
3. On the roster, mark each seat **Attended**, **No show** or **Excused**; a seat's bill button reads "UNPAID" while its bill is open.
4. Click **Hold session** when the class has run; the confirmation names the unmarked seats it will mark no-show, and the marks are final after that.

The roster is the same one the Class Schedule screen shows: its waitlist buttons (**Offer**, **Confirm**, withdraw) and a seat's cancel button work here as they do there.

### Settle a bill opened here

1. Click **Bill** wherever it shows: in the footer of the Serve panel ("Bill 10.00"), on a row of the register, on an item under **Out now**, or on a slot.
2. The system takes you to Facility Bookings and opens that bill in its bill drawer; settle it there.
3. Return to Control Station from the menu.

A person's paid items of one day go on one open bill: the first paid item opens it and the next ones add their lines while it is open.
A guest's fees always go on a bill in the member's name; the panel shows it as "Open bill FBL-00016 · 10.00 · in Ahmad Faizal's name".

### Sign people out and close the day

1. To sign one entry out, click **Sign out** on its row in the register, or in the person's panel on the **Inside** tile (**Sign out with 1 guest** when the member's guests leave with them).
   A guest on the member's entry reads "signs out with Ahmad Faizal" and has no button of their own.
2. Read the answer: "RG-00005 signed out. Bill FBL-00016 is still open. Still out: TOWEL (Wong Mei Ling)."
   Sign-out never stops for an open bill or an item still out; it tells you so you can settle and collect.
3. At closing, open each entry type's chip and click **End of day** (greyed when nobody is inside), read "3 registrations still in will be signed out at 21:45. Utility items past their due time are listed as overdue; nothing is written off.", and click **Sign everyone out**.
   The answer is "3 registrations signed out."
4. On a slot type with no-show control on, **End of day** records every slot still booked past its end as a no-show; the confirmation says how many slots qualify, and the button is **Record the no-shows**.
5. Check the red "overdue" total on the day line and the **Overdue** chips under each Utility Item, and chase what is still out.

## Field reference

### Scan box (and the "Next person" field in the panel)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Scan a guest pass or key a member number** | Yes | The guest's pass (scanned, or its link pasted) or a member number, e.g. `A0018`. | Shown on today's date only. Anything that is not a pass is read as a member number. Up to 600 characters. |

### Add guest (member's panel)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Guest name** | Yes | The guest's name as it should appear on records and the pass. | Up to 255 characters. |
| **Mobile** | No | Pick the country code, then type the number; used for the WhatsApp share. | A mobile or an email gives the guest a day pass. Required (one of the two) when the club insists on a contact. |
| **Email** | No | The guest's email address; used to email the pass. | Must be a valid address; up to 255 characters. |

### Enter a facility (guest's tile)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Guest type** (list on the tile) | - | The visitor guest type the guest is admitted and billed as. | Shown only for a guest, and only when the club keeps more than one visitor guest type. |

### Check in

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Participant tick boxes** | - | Leave ticked who arrived; untick a guest who did not. | All ticked to start with. The host's line is fixed. A booking with no participants reads "No participants were keyed on this booking - the booker checks in alone." |

### Register (entry type)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Member number** | Yes | The member who enters and hosts the guests, e.g. `A0018`. | Up to 50 characters. The member must exist and not be barred. |
| **Facility** | No | One facility of the type, when the entry counts against that facility. | Shown only when the type has more than one active facility; type to search; "Any (the type's capacity)" counts against the type. |
| **Remarks** | No | A note kept on the entry. | Up to 255 characters. |

### Guest lines (Register and Guests forms)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Type** | Yes | The guest's participant type: a visitor guest, or a member coming as a guest. | From the club's guest participant types. |
| **Guest name** | Visitor: Yes | The visitor's name. | Up to 255 characters. Fixed on a line that stands on a guest pass. |
| **Member No** | Member as guest: Yes | The guest member's number. | Up to 50 characters. The member must exist and not be barred. |
| **Mobile (optional)** | No | The visitor's mobile; pick the country code, then type the number. | A mobile or an email registers the guest: a day pass, and the visit counts once. |
| **Email (optional)** | No | The visitor's email address. | Must be a valid address; up to 255 characters. |

Up to 50 guest lines per entry; the red cross removes a line.

### Issue / Record use (counted and use-only Utility Items)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Member number** | Yes | The member who takes the item. | Up to 50 characters. The member must exist and not be barred. |
| **Quantity** | Counted item: Yes | How many pieces are handed out, e.g. `2`. | 1 to 500; within the limit per person. Not shown for a use-only item. |
| **Remarks** | No | A note kept on the record. | Up to 255 characters. |

### Return

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Condition** | Yes | **Good**, **Damaged** or **Lost**. | Opens on Good from the board or list, on Damaged from the panel. Damaged or lost parks a numbered unit out of service until it is cleared. |
| **Pieces returned** | No | How many pieces of a counted item came back. | 0 up to the number issued; the difference is recorded as lost. Not shown for a numbered unit or when the condition is Lost. |
| **Remarks** | No | The damage noted at return. | Up to 255 characters. |

### Class walk-in (roster)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Member / Visitor** | Yes | Who takes the seat. | Visitor is offered only when the class takes visitors. |
| **Member number** | Member: Yes | The member's number, e.g. `A0018`. | Up to 50 characters. |
| **Visitor's name** | Visitor: Yes | The visitor's name. | Up to 255 characters. |
| **Mobile** | No | The visitor's mobile. | Up to 30 characters. |
| **Remarks** | No | A note kept on the seat. | Up to 255 characters. |

## Tips & troubleshooting

**At the scan box**

- If you see "'X123' is not a guest pass of this club or a member number.", check the number with the member; the refused text stays selected, so the next scan simply replaces it.
- If you see "No guest pass of this club matches that code.", the code is not one of this club's passes.
- If you see "Pass GR00001 is cancelled.", "This pass is for 14 Nov 2026 - it is not valid today." or "This pass was for 12 Nov 2026 and has expired.", the pass cannot be used today; the guest is served with the member at the counter instead.
- If you see "Member: member A0018 (Suspended) is barred." (or "Host: member A0018 (Suspended) is barred." when a guest's pass was scanned), the member is barred and neither the member nor their guest can be served.
- If the camera view says "Camera not available or permission refused - type or scan the code into the box instead.", allow the camera for this site, or use the scan box.
- The scan box is hidden on any date other than today; click **Today** to bring it back.

**On an item tile**

- "Members only." - the Utility Item is not handed to guests.
- "Only for a person inside a facility today." - admit the person to a facility first.
- "Limit reached - holding 1 of 1." or "Limit reached - used 1 of 1 today." - the person is at the limit per person; take an item back first.
- "No unit free." - every unit is issued or parked; clear a parked unit if it is fit to use.
- "LOCKERFEE has no price today." - the fee has no price for today; ask whoever maintains Transaction Types to add one.
- If a tap is refused with "That unit is not available.", another desk took the unit a moment earlier; the panel refreshes, so tap another.
- If you see "Ahmad Faizal would hold 3 TOWEL pieces - the limit is 2 (already holding 1).", lower the quantity on the Issue form.

**On a facility tile or the Register form**

- "GYM is closed at 22:10 (open 07:00 to 22:00)." or "GYM is closed right now." - outside opening hours, or closed by a facility closure.
- "Full - 40 of 40 inside." (tile) or "GYM is at capacity - 40 of 40 inside, 2 arriving." (form) - sign out people who have left, then try again.
- "Visitor guests are not allowed on GYM now." - the club's guest rules do not admit visitor guests at this time.
- "Ahmad Faizal must enter GYM first." - this facility admits a guest only once the member is inside; admit the member, then the guest.
- "Ahmad Faizal has no guest visits left this month." - the member's monthly guest allowance is used up.
- "At most 2 visitor guests per visit on GYM." - the member's entry already carries the most guests allowed.
- "GYM admits members holding a booking today - Ahmad Faizal has none." - this facility needs a booking on the day.
- "GUESTFEE has no price today." - the entry or guest fee has no price for today.
- If the Register form says "Ahmad Faizal's guests are already inside GYM - admit Ahmad Faizal from the Serve panel (key the member number in the scan box).", do exactly that so the member joins the guests' entry.
- If you see "Ahmad Faizal (A0018) has 1 of 4 monthly guest visits left - this entry needs 2.", register fewer new guests.
- If the Register or Issue form says "Member: no member found with number 'A0099'.", check the member number.
- If the Register form says "Visitor guests are not allowed on GYM at 10:15 on 13 Nov 2026." or "Members as guests are not allowed on GYM at 10:15 on 13 Nov 2026.", the club's guest rules refuse that kind of guest now.
- If a guest line is refused with "Guest 1: key in the guest's name.", "Guest 1: key in the member number." or "Guest 1: the email is not a valid address.", complete or correct that line.

**Guests**

- If you see "Ahmad Faizal (A0018) may not bring guests under their membership type." or "Ahmad Faizal (A0018) has used all 4 guest visits of the month.", the guest cannot be added.
- If you see "No automatic Guest Registration No. series is set up (Membership Management - Numbering Control) - Lim Ah Kow is served by name, without a pass.", the guest is still served; ask for the number series to be set up.
- If removing a guest answers "Siti Aminah holds or has taken an item today - the pass stays." or "Siti Aminah has entered a facility on this pass - the pass stays.", the guest can no longer be removed as a mistake.
- If you see "Pass GR00001 was not registered at the station - cancel it under Guest Registrations.", the pass was made in Membership and is cancelled there.
- If saving guests answers "Tan Wei Ming still holds an item - take it back before removing them from the entry.", record the return first.

**Check-in, undo and returns**

- If you see "Check-in for 08:00 opens 30 minutes before the slot (club time 07:10)." the slot is still **Not yet**; if you see "The 08:00 slot has ended - it can no longer be checked in." it is **Closed**.
- If you see "The 08:00 slot is inside its grace of 15 minutes - not a no-show yet.", wait for the grace period to pass.
- If you see "Configure the Registration No. numbering scheme first (Facility Management - Numbering Control).", the registration number series is missing.
- If you see "Undo is for the first 5 minutes - return it the normal way." or "Its bill is already settled - return it the normal way.", use **Return** instead.
- If you see "Returned pieces must be between 0 and 2.", correct the **Pieces returned**.
- If you close a form with details keyed in, the system asks "Discard?" before it throws them away.
- When the club has "Sign everyone out at the type's close time" switched on in Facility Specification, entries still in are signed out by the system after the type's close time, so the register never carries yesterday's names.

## Related options

- Facility Management → Facility Bookings - the bookings whose slots are checked in here, and the bill drawer where every bill opened here is settled.
- Facility Management → Utility Items - the lockers, towels and showers the station hands out, their units, limits, fees and whether guests may take them.
- Facility Management → Facility Types - the courts, gym and pool: opening hours, capacity, guest rules and fees.
- Facility Management → Facility Specification - the check-in window, automatic sign-out at close, the two guest switches of the station, no-show control and classes.
- Facility Management → Facility Closures - the closures that shut a facility for part of a day.
- Facility Management → No-show Charges - follow-up of the charges raised by **No show** and **End of day**.
- Facility Management → Class Schedule - the sessions listed under CLASSES, and enrolment for classes that take no walk-ins.
- Facility Management → Transaction Types - the fee items and prices shown on the tiles.
- Facility Management → Numbering Control - the Registration No. series.
- Membership Management → Guest Registration - where passes are registered ahead of the visit, and where a pass not made at the station is cancelled.
