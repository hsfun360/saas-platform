# Golf Booking

> **Where:** Golf Management → Golf Booking
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New booking button needs the Create permission; Change booking and Cancel booking need the Edit permission and the booking must be within your data scope.

## What this option is for

The Golf Booking screen is where staff take advance tee-time bookings for members.
A booking is made in three steps: key in the member who is booking and check their standing, search the available flights nearest the time they want, then hold a flight while you key in the players and confirm.
The available flights are computed live from the Course setup, the Course Closure plans, the holds of group bookings and the booking rules in Golf Specification (advance window, merge rule, minimum players, guest control, booking limits, handicap and junior control), so what the screen offers is what the club allows.
A group's shotgun window blocks the course's nines like a closure, and a group's reserved flight holds its whole tee-time cell, so neither is ever offered here.
Staff also come here to change a booking (move it to another flight, add or drop players, update the contact details) or cancel it; in both cases the screen tells you beforehand whether the action is inside the notice period and what charge, if any, the booker will bear.
Group and tournament bookings are made on the Group Bookings screen, and same-day walk-ins are registered at the Tee Time Sheet.

## The screen at a glance

[Screenshot: Golf Booking day list]

- A **Play date** field at the top filters the list; it starts on today.
  With nothing on that date the screen reads "No bookings for <date> yet. Use 'New booking' to make the first one."
- Each booking is a card titled with the tee time and the course, then the booking number, the holes (9 or 18), the crossover time for an 18-hole flight, the contact mobile, and the players ("3 player(s): Ahmad Faizal, Lim Wei, Guest").
- A status chip at the top right shows **BOOKED** (green), **CANCELLED** or **NO SHOW** (grey); NO SHOW appears when every player of the booking was recorded as a no-show at the front desk.
- A booked card has a ⋮ menu holding **Change booking** and **Cancel booking**; a booking that has been changed also shows a blue **Changed ×n** chip and a **Change history** item in the menu.
- The **New booking** button floats at the bottom right of the screen.

## Common tasks

### Make a booking

[Screenshot: New booking dialog - member check]

1. Click **New booking**.
2. Key in the **Member No** of the member making the booking and click **Check** (leaving the box also checks).
   A card shows the member's name, membership category, status, whether golfing rights are held ("No golfing right - member rate applies" means they may book and are charged the member green fee), and the dates they **Can book**.
   A member whose status carries a warning shows "Member status '<status>' carries a warning - proceed with care." (and the card turns amber); a barred member cannot search.
3. Pick the **Date** (the calendar is limited to the member's booking window and starts on its last day), optionally a **Course** (or leave **All courses**), the **Preferred Time**, the **Number of Players** (starts at 4) and the **No of Holes**.
4. Click **Search flights**.

[Screenshot: Available flights]

5. The dialog lists, per course, the five flights nearest the preferred time that can take the party.
   Each row shows the tee time, seats left, how many players are already booked on it, the crossover time, the minimum players for that flight and whether it is a front-desk time.
   When nothing fits it reads "No available flight matches this search - try another time, date or course."
   Use **Refresh** to recheck, or **« Back** to change the search.
6. Click **Book** on the flight you want.

[Screenshot: Key in players with the hold countdown]

7. The flight is now held for you: the banner reads "Flight held - confirm within m:ss" (the hold length comes from Golf Specification; five minutes unless changed).
   A summary underneath names the course, date, tee time, crossover time and holes, and "n player(s) already booked on this flight" when you are joining others.
   If the countdown runs out the hold is released and you are returned to the flight list.
8. Player 1 is the booker and is fixed; its line carries a **Booker** tag instead of a remove button.
   For each other line pick the **Type** - **Member**, **Member as Guest** or **Guest** - and key in the **Member ID** or the **Guest Name** (a plain `Guest` is accepted; the guest's details are captured at registration).
   Use **Add player** (up to the seats left) and the ✕ button to adjust the lines.
9. Optionally enter the **Contact Mobile** and **Remarks**.
10. Click **Confirm booking**.

The system re-checks every rule at this moment, issues the Booking No., saves the booking and sends one confirmation email addressed to every player who has an email on their member record.
The list jumps to the play date with the new booking highlighted.
Clicking **« Back** on the players step releases the hold; closing the dialog before confirming asks "Abandon this booking?" because the flight is released.

### Change a booking

[Screenshot: Change booking dialog - current flight and players]

1. Open the booked card's ⋮ menu and click **Change booking**.
   The dialog opens on the booking's players: a **Current flight** card at the top (course, tee time, crossover time, holes, date and who booked), then one line per player and the Contact Mobile and Remarks fields.
2. To move the flight, click **Move flight**.
   The search form opens pre-filled with the booker, date, time, party size and holes; change what you need and click **Search flights**, then **Move here** on the flight you want.
   The new flight is held with a countdown exactly like a new booking, and the players step shows "Moving from <current flight> to <new flight>"; **Keep the current flight instead** releases the hold and goes back.
   The booking's own seats never count against the flights offered, so the booking can move to an emptier time on the same flight's day or to another day inside the booker's window.
3. To drop a player, click the ✕ on their line.
   An existing player is shown read-only; to correct a name or number, drop the line and add a new one.
   A player who is already **Registered** at the front desk shows a Desk tag and cannot be dropped, and a booking with a registered player cannot be moved.
4. To add a player, click **Add player** and key in the line as for a new booking (up to the seats left on the held flight, or ten in total).
5. Update the **Contact Mobile** or **Remarks** if needed, then click **Review change**.

[Screenshot: Confirm change view]

6. Read the review; it states the outcome in one sentence ("Moved from 24 Oct 2026 07:15 (E1, 18 holes) to 24 Oct 2026 08:30 (E2, 18 holes); 1 player(s) dropped: Lim Wei.") and lists the flight before and after, the players kept, the players added (green) and the players dropped (red).
   While the Cancellation & No-show rules are switched on and the original flight is inside its notice period, a notice explains the rule that applies:
   - Moving to another flight on the **same day** is free: "This change is free: a move to another flight on the same day carries no charge."
   - Moving to **another day** is treated as a late cancellation of the original flight: with **Allow the cancellation and charge the no-show penalty** the notice prices the charge for the booked players ("A late-change charge of 168.00 (2 × 80.00 + 8.00 tax) for Ahmad Faizal, Lim Wei will be posted to <booker>"); with **Refuse** the move is refused before the review opens ("Bookings need 24 hours' notice to move to another day - the notice period has ended. The booking may still move to another flight on the same day.").
   - **Dropping players** inside the notice period is charged per dropped player when the charge basis is **Per no-show player**, is free on a partial drop when the basis is **Per booking**, and is refused under **Refuse** ("Bookings need 24 hours' notice to drop players - the notice period has ended.").
   Tick **Waive the late-change charge** and give a **Waive reason** to change without charging.
7. Optionally enter a **Reason**; it is kept in the booking's change history.
8. Click the button; it reads **Move booking**, **Confirm change**, **Change and charge 168.00** or **Change and waive charge** according to the outcome, or **« Back** to adjust.

The booking keeps its number, the list jumps to the new play date with the booking highlighted, the card gains the **Changed ×n** chip, and one email goes to every affected player with an email address, dropped players included.
Dropped players are released from the flight; a posted charge is shown on the No-show Charges screen.
Closing the dialog before confirming asks "Abandon this change?" and leaves the booking as it was.

### See a booking's change history

1. Open the card's ⋮ menu and click **Change history** (shown once the booking has been changed).
2. Each change is a card numbered #1, #2, ... with its kind (Flight moved, Players changed, Details updated, Flight and players changed), when it was made, the confirmed sentence and the reason.

### Cancel a booking

[Screenshot: Cancel booking dialog]

1. Open the booked card's ⋮ menu and click **Cancel booking**.
2. Read the confirmation; it names the booking, tee time, date and course, and states that the flight is freed for other bookings.
   While the Cancellation & No-show rules are switched on, the dialog also checks the notice period ("Checking the cancellation notice…"):
   - **Within the notice period, charge** - an amber notice reads "Within the 24-hour notice (ended <date> <time>). A late-cancellation charge of 84.00 (1 × 80.00 + 4.00 tax) will be posted to <booker> (<member no>)."
     Tick **Waive the late-cancellation charge** and give a **Waive reason** to cancel without charging.
     If the booker is not a member, the notice adds "The booker is not a member - the charge is recorded as pending for collection at the counter."
     When the penalty cannot be priced it reads "The charge cannot be priced: <reason>" and the cancel button stays greyed out until the setup is fixed or the charge is waived.
   - **Within the notice period, refuse** - a red notice reads "Bookings need 24 hours' notice to cancel - the notice period ended <date> <time>. This booking cannot be cancelled now; players who do not turn up are recorded as no-shows."; only **Keep booking** is offered.
   - Otherwise the cancellation is free.
3. Optionally enter a **Reason**.
4. Click the red button; it reads **Cancel booking**, **Cancel and charge 84.00** or **Cancel and waive charge** according to the outcome, or **Keep booking** to back out.

The booking turns **CANCELLED**, its still-booked players are released from the flight, and one cancellation email goes to every player with an email address.
Players already registered at the front desk stay on the tee sheet.
A posted charge is shown on the No-show Charges screen.

## Field reference

### Step 1 - New booking

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Member No** | Yes | The member number of the booker, e.g. `A0018`; click **Check** to resolve it. | Up to 50 characters; must be an existing member whose status allows booking. |
| **Date** | Yes | The play date. | Must fall inside the window shown on the member card; the window follows Golf Specification (advance days, early opening hours, same-day booking, per-membership-type overrides). |
| **Course** | No | One course, or **All courses** to search every active course. | Type to filter the list. |
| **Preferred Time** | Yes | The tee time the member would like, e.g. `08:00`; the search returns the nearest flights around it. | A time of day; starts at 08:00. |
| **Number of Players** | Yes | How many will play, including the booker; it decides which flights have room and pre-creates that many player lines. | 1 to 8; starts at 4. |
| **No of Holes** | Yes | **9 holes** or **18 holes**. An 18-hole booking occupies the start flight on the first nine and the crossover flight on the second nine. | Starts at 18. 9-hole play is not offered on flights where 18 holes are still mandatory. |

### Step 3 - Key in players

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Type** (per line) | Yes | **Member** - a member playing in their own right. **Member as Guest** - a member playing under this booking as the booker's guest. **Guest** - a visitor. | Player 1 is always the booker (Member). Guest and Member-as-Guest lines count against the booker's guest quota and the guest-control rules. |
| **Member ID / Guest Name** (per line) | Yes | The member number for Member and Member as Guest lines; a name (or `Guest`) for a Guest line. | Member lines must resolve to existing members who are not barred; a guest name is up to 100 characters. |
| **Add player** | - | Adds a line while seats remain on the held flight. | Lines cannot exceed the seats left. |
| **Contact Mobile** | No | A mobile number for the booking; pick the country code, then type the number. | Up to 30 characters. |
| **Remarks** | No | Any note for the front desk. | Up to 255 characters. |

### Change booking dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Move flight** | - | Opens the search for another flight; the booker, date, time, party and holes start from the current booking. | The booking's own seats are not counted against the flights offered; a booking with a registered player cannot be moved. |
| Player lines | - | Existing players are read-only with a ✕ to drop them; new lines take a **Type** and a **Member ID / Guest Name** as on a new booking. | A registered player cannot be dropped; dropping every player is a cancellation, use Cancel booking instead; lines cannot exceed the seats left on the held flight. |
| **Contact Mobile**, **Remarks** | No | The booking's contact and note. | Up to 30 and 255 characters. |
| **Waive the late-change charge** | No | Tick to change inside the notice period without charging the booker. | Shown only when a charge would apply. |
| **Waive reason** | Yes when waiving | Why the charge is waived. | Up to 255 characters; kept on the charge record. |
| **Reason** | No | Why the booking is changed. | Up to 255 characters; kept in the change history. |

### Cancel booking dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Waive the late-cancellation charge** | No | Tick to cancel inside the notice period without charging the booker. | Shown only when a charge would apply. |
| **Waive reason** | Yes when waiving | Why the charge is waived, e.g. `Course flooded`. | Up to 255 characters; kept on the charge record. |
| **Reason** | No | Why the booking is cancelled; it is included in the cancellation email. | Up to 255 characters. |

## Tips & troubleshooting

- If you see "No member found with number 'X'." check the member number; the search is not case-sensitive.
- If you see "Member X (status) is barred from booking." the member's status forbids booking; resolve it under Membership first.
- If you see "This member can book from <date> to <date> (advance window)." the chosen date is outside the member's window; pick a date inside it or review the advance-booking rules in Golf Specification.
- If you see "X already has a booking on <date> - 08:05 (EAST, B260900001)." the club allows one booking per day and the member (or a member player line) already holds one; cancel that booking first or add the member to it at the front desk.
- If you see "X already has a Morning session booking on <date> - ..." the club limits bookings per session band; pick a flight in another session.
- If you see "That flight was just taken - refresh the available times." another booking claimed the flight while you were looking; the list refreshes.
- If you see "The flight lock expired - pick a flight again." the hold ran out before you confirmed; click **Book** on a flight again.
- If you see "The flight no longer has room for these players." or "The crossover flight no longer has room for these players." reduce the party or pick another flight.
- If you see "The flight is now blocked by a course closure." a closure plan, or a group booking's shotgun hold on that course, was saved while you were keying players; choose another time.
- If you see "That flight time is reserved for front-desk registration - it cannot be booked in advance." or "That flight time is closed for crossover - no new tee-offs." the tee-time set marks that time as a Front desk or X-over slot; the list refreshes and you pick another flight.
- If you see "This flight needs at least n player(s)." add players, or join a flight that already has players so the flight total meets the minimum.
- If you see "Guests are not allowed on this flight (guest control)." or "Members as guests are not allowed on this flight (guest control)." the club's guest rules forbid that player type at this course, day or time.
- If you see "Membership type X can bring up to n guest(s) per booking - this booking has m (members as guests count)." or "Membership type X cannot bring guests." the booker's membership type caps guests; the quota is set on the Membership Type master.
- If you see a handicap message (for example a player exceeding the course's maximum handicap, or a beginner needing established companions) the Handicap Control rules refused the flight; check the golfer's index and status on the Golfers screen and the rules in Golf Specification.
- If you see "X is a junior member and must play with their principal (parent), who is not in this booking." or "...must be accompanied by an adult member." add the parent or an adult member to the booking.
- If you see "Configure the Booking No. numbering scheme first (Golf Management → Numbering Control)." or "The Booking No. scheme is manual - key in a booking number." set the Booking No. series to Auto-generate on Numbering Control.
- If you see "Player n: key in the member number." or "Player n: key in the guest name (or 'Guest')." a player line is incomplete.
- If you see "Only a booked booking can be cancelled." or "Only a booked booking can be changed." the booking is already cancelled.
- If you see "Nothing changed." the review was requested without moving the flight, changing a player line or editing the contact details.
- If you see "A registered player cannot be dropped - the desk already processed them." or "A booking with a registered player cannot be moved." the front desk has registered that player; changes to registered players are made on the Tee Time Sheet.
- If you see "Dropping every player is a cancellation - use Cancel booking." remove the booking through Cancel booking instead.
- If you see "The flight has no room for n player(s)." or "The crossover flight has no room for n player(s)." the roster after the change does not fit the flight; drop a player or move to another flight.
- If you see "Bookings need n hours' notice to move to another day - the notice period has ended. ..." or "... to drop players ..." the club refuses that change inside the notice period; a move to another flight on the same day is still allowed.
- If you see "The late change cannot be charged: ..." the No-show Charge type has no price in force or is not set; fix it in Golf Specification or Transaction Type, or waive.
- If you see "Player n is not on this booking any more - reload the booking." someone else changed the booking meanwhile; close the dialog and open Change booking again.
- If you see "Bookings need n hours' notice to cancel - the notice period for X ended ..." the club refuses late cancellations; the booking stands and no-shows are recorded at the front desk.
- If you see "Give a reason for waiving the late-cancellation charge." the Waive reason box is empty.
- If you see "Late cancellation cannot be charged: ..." the No-show Charge type has no price in force or is not set; fix it in Golf Specification or Transaction Type, or waive.
- If you see "You are not allowed to amend this booking." the booking lies outside your role's data scope.
- A member with no golfing right may still book and is charged the member green fee at registration; members with golfing rights are not charged a green fee.
- Keep the Play date filter in mind when a booking "disappears": the list shows one date at a time, and a confirmed booking moves the filter to its play date.

## Related options

- Golf Management → Courses - the flight schedule the search reads (sets, flight times, Front desk and X-over roles, cross over time).
- Golf Management → Course Closure - closed times are never offered.
- Golf Management → Golf Specification - advance window, hold minutes, merge rule, minimum players, guest control, booking limits, sessions, handicap and junior control, and the Cancellation & No-show rules.
- Golf Management → Golfers - handicap index and status checked by the handicap rules.
- Golf Management → Numbering Control - the Booking No. series.
- Golf Management → Front Desk → Tee Time Sheet - registers the booked players on the day, takes walk-ins and records no-shows.
- Golf Management → Front Desk → No-show Charges - follow-up of late-cancellation charges raised here.
- Golf Management → Group Bookings - group and tournament bookings.
- Membership Management → Membership Type - golf guest quota per booking and golfing rights.
