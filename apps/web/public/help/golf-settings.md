# Golf Specification

> **Where:** Golf Management → Golf Specification
>
> **Who can use it:** users whose role includes the Golf Management module.

## What this option is for

The Golf Specification holds the club-wide golf rules that the Booking and Front Desk screens apply automatically.
There is one specification per club (company): how far in advance members may book, how many players a booking must bring, when guests are allowed, handicap limits, the cancellation notice and no-show penalty, whether rain checks may be issued and what they are worth, whether group bookings go through holds, approval and a deposit deadline, and the colours of the Front Desk tee sheet.
Staff come here when the club changes a policy - the next booking or registration follows the new rule straight away.
Nothing here edits existing bookings; the rules are read at the moment a booking is made, cancelled or registered.

## The screen at a glance

[Screenshot: Golf Specification screen with all sections expanded]

- The screen is one form made of nine collapsible sections: **Booking Rules**, **Minimum Players**, **Guest Control**, **Handicap Control**, **Cancellation & No-show**, **Rain Checks**, **Playing Rights & Round Quotas**, **Group Bookings** and **Tee Sheet**.
- Click a section's header band to fold it away or open it again; folding never loses what you typed.
- Each section mixes plain fields with switches (tick boxes); some switches reveal more fields when turned on.
- Several sections carry an exception table (**Add exception**, **Add limit**, **Add rule**, **Add session**, **Add override**) - rows you add, edit in place and remove with the red cross.
- There is one **Save** button at the bottom; it is greyed out until something has changed, and saves every section at once.
- A green message confirms the save; a red message explains what the system refused.

## Common tasks

### Set how far ahead members may book

1. Open **Booking Rules**.
2. Enter the **Advance Booking Days** (e.g. `7` for a seven-day window) and, if the club opens the next day's window the evening before, the **Advance Booking Hours** before midnight.
3. Read the preview line under the fields - it states the rule in words, e.g. "Bookings for a play date open 7 day(s) before - and already the previous evening from 10:00 pm".
4. Click **Save**.

If certain membership types may book earlier than everyone else, tick **Allow Membership Type to override the advance booking days**, click **Add override**, pick the membership type and enter its own number of days.
A membership type without golfing rights is listed with the suffix "(no golfing right)" so you can tell it apart.
Override lines are kept even while the switch is off, but only take effect while it is on.

### Limit how many bookings a member may hold

1. In **Booking Rules**, set the **Weekday booking limit** and the **Weekend & holiday booking limit**:
   - **No limit** - members may hold any number of bookings on a day.
   - **One booking per day** - a second booking on the same play date is refused; the search already tells the member which flight they hold.
   - **One booking per session** - one booking in each of the club's day parts (Morning, Afternoon, ...); flights in a session the member already booked are hidden from the search.
2. For **One booking per session**, define the **Sessions**: click **Add session**, give each a **Name**, a **From** time and an **Until** time (the Until time is not included - 12:00 ends the Morning and starts the Afternoon).
3. Click **Save**.

A member counts as holding a booking when they made it or appear in it as a Member player; playing as another member's guest does not count, and cancelled bookings free the slot.
Public holidays follow the weekend rule.

### Require a minimum number of players

1. Open **Minimum Players** and enter the **Weekday Minimum** and **Weekend & Holiday Minimum** (1 means no restriction).
2. For a course, a day or a time band that needs a different minimum, click **Add exception** and fill the row: **Course** (or Every course), **Days**, optional **From** / **To** times (leave both empty for the whole day) and **Min**.
3. Click **Save**.

A booking passes when its own players meet the minimum - or when joining an existing flight brings that flight's total up to it.
When several exceptions could apply, the most specific wins: a specific course beats Every course, a time band beats the whole day, and a specific day (e.g. Sunday) beats Weekend & Holiday, which beats All days.

### Restrict guests

1. Open **Guest Control** and tick **Enable guest control**.
   While it is off, guests are always welcome and the settings below are ignored.
2. Under **Weekday** and **Weekend & Holiday**, tick or untick **Allow guest (visitor)** and **Allow member as guest** (a member playing under another member's booking).
3. For finer control - e.g. no guests on Sunday mornings on the West course - click **Add exception** and fill the row with the same Course / Days / From / To scoping plus the two guest tick boxes.
4. Click **Save**.

Guest control is enforced when a booking is made and checked again when players register.
How *many* guests a member may bring is not set here - it is the guest quota on the Membership Type.

### Apply handicap limits and accompaniment rules

1. Open **Handicap Control** and tick **Enable handicap control**.
   Rules are kept while the switch is off and only take effect while it is on.
2. Under **Handicap limits**, click **Add limit** for each cap: **Course**, **Days**, **Holes** (9, 18 or Any), **Gender** (Men, Ladies or Any), the **Max hcp** index, and optionally the **Latest tee-off** time the capped golfers may start.
   Example: Men 36.0 and Ladies 40.0 on weekdays for 18 holes, latest tee-off 14:29.
3. Under **Beginner & provisional accompaniment**, click **Add rule** for each situation where inexperienced golfers must be accompanied: the scope (Course, Days, Holes, From / To), whether it applies to **Beg**inners and/or **Prov**isional golfers, the **Min** number of companions, the companion handicap caps for **Men ≤** and **Ladies ≤**, and an optional **Latest tee-off**.
4. Click **Save**.

A golfer's handicap index and status (Established, Provisional, Beginner) are kept on the Golfers screen, and their gender comes from the member record.
Golfers with no handicap recorded are exempt from the limits.
The Booking screen refuses a flight that breaks a rule; the Front Desk still registers the players but shows a warning.

### Set the cancellation notice and no-show penalty

[Screenshot: Cancellation & No-show section with the control switched on]

1. Open **Cancellation & No-show** and tick **Enable cancellation & no-show control**.
2. Enter the **Cancellation Notice (hours)** - a booking cancelled with less notice than this before its first tee time is a late cancellation (`24` for a 24-hour rule; `0` switches the notice rule off).
3. Choose what a late cancellation does under **Late Cancellation**:
   - **Allow the cancellation and charge the no-show penalty** - the flight is freed for others and the penalty is charged to the booker (staff may waive it with a reason at the time of cancelling).
   - **Refuse the cancellation - the booking stands** - the booking cannot be cancelled; players who do not turn up are recorded as no-shows at the front desk.
4. Pick the **No-show Charge** - the Transaction Type (charge type *No Show Charges*) whose flat price and tax scheme make up the penalty, e.g. a type priced 80.00 with the service-tax scheme.
5. Choose the **Charge Basis**: **Per no-show player** multiplies the price by the number of players who did not show; **Per booking** charges it once.
6. Click **Save**.

The penalty is never charged silently: the Booking screen shows the exact amount before a late cancellation is confirmed, and the Tee Time Sheet's **No-shows** review lists who did not register before anything is recorded.
Charges are posted to the booker's member account and can be followed up on the No-show Charges screen.

### Allow rain checks for abandoned rounds

[Screenshot: Rain Checks section with the switch on]

1. Open **Rain Checks** and tick **Enable rain checks**.
   Turning it on reveals the three fields below and adds **Issue rain check** to the Tee Time Sheet's ⋮ menu of a registered player whose bill is settled.
2. Enter **Valid for (days)** - how long an issued rain check can be redeemed, counted from the day of issue (`90` for three months).
3. Choose the **Value Basis**: **Green-fee lines only** credits the green fee paid and treats caddy, buggy and food as consumed; **The whole bill** credits everything on the settled bill.
4. Tick or untick **Prorate by holes not played**: ticked, the value is the basis times the share of holes not played (the desk keys the holes played when issuing); unticked, the full basis is credited whatever was played.
   A preview sentence restates the rule on a worked example, for example "A rain check is worth the settled bill's green-fee lines, prorated by the holes not played (6 of 18 holes played on a 90.00 green fee = 60.00); the desk may lower it, never raise it. It can be redeemed once, on one later bill of the same golfer, within 90 days of issue."
5. Click **Save**.

The three fields are kept while the switch is off, so a club can prepare the rule before switching it on.
A rain check needs a Rain Check No. series under Numbering Control, and redeeming one needs a payment type of class Rain Check.

### Restrict where and how often a player type may play

[Screenshot: Playing Rights & Round Quotas section with rows]

1. Open **Playing Rights & Round Quotas** and tick **Enable playing rights & round quotas**.
2. Under **Playing rights (whitelist)**, click **Add playing right** for each allowance: pick the **Target** (a player type, or an affiliated or reciprocal club), optionally a **Membership type** when the target is a member-base type, the **Course** (or every course), the **Days**, a **From** / **To** time band, and **Valid from** / **Valid to** dates.
   A target with no rows may play anywhere; a target with rows may play only inside at least one of them, so a reciprocal club allowed "weekdays before noon on E1" gets one row saying exactly that.
3. Under **Round quotas**, click **Add round quota** for each cap: the **Target** (and membership type), the **Days** it counts, the **Period** (per week, month or year), **Max rounds**, and optionally **Max guest rounds** (the guests that member may bring over the same period).
   The most specific row wins: a club over a player type, a named membership type over every type, a specific day over weekday or weekend over all days.
4. Click **Save**.

The booking screen refuses a booking whose player falls outside their playing rights or would exceed their quota, and says why ("already has 4 weekend rounds this month - Ordinary member allows 4"); the Tee Time Sheet warns on registration.
An affiliated visit's confirmation preview applies the club's playing rights too.
Rows are kept while the switch is off.

### Control group bookings

[Screenshot: Group Bookings section with the control switched on]

1. Open **Group Bookings** and tick **Enable group booking control**.
   Leave it off if the club only keys its own events (a committee club's Monthly Medal): a group booking is then confirmed the moment it is created.
   Turning it on reveals five more fields: three timers directly underneath, and two more under **Share caps**.
2. Enter the **Tentative Hold (hours)** - how long a tentative booking's reserved flights hold the tee sheet before they are released if the booking has not been submitted for approval (`72` for three days; `0` holds them until submitted).
3. Enter the **Deposit Due (days after approval)** - the proforma's pay-by date defaults to this many days after approval.
4. Enter the **Default Deposit (% of the group bill)** - the deposit demanded when the proforma does not state one (`0` means no deposit, so approval confirms the booking at once).
   A preview sentence restates the three timers in words, for example "Reserved flights of a tentative booking are released after 72 hour(s) unless it is submitted for approval. Unless the proforma states otherwise, the deposit is 30% of the group bill, due 7 day(s) after approval; a booking whose deposit is not in by then lapses and its flights are released."
5. Under the **Share caps** sub-heading ("The hard ceiling on the share of a course's tee times that all group bookings together may hold on one day - whatever an approver decides. Reserve flights refuses past it. Club events are exempt and do not count. 0 = no cap."), enter the **Weekday Group Share Cap (%)** and the **Weekend & Holiday Group Share Cap (%)**.
   These two fields are always visible and apply whether the control is on or off; a reservation that would push groups past the cap is refused with the numbers.
6. With the control on, enter **Tentative Bookings per User** - how many tentative bookings with reserved flights one user may hold at a time (`0` means no limit).
7. With the control on, enter **Next in Line (hours)** - when a held day frees up, how long the first group on its waitlist has to reserve it before the offer passes to the next group.
8. Read the second preview sentence under the caps, for example "Reserve flights refuses past the cap: on a weekday all groups together may hold at most 40% of a course's tee times, on a weekend or holiday all groups together may hold at most 25% of a course's tee times. Club events are exempt and do not count. A user may hold at most 3 tentative booking(s) with reserved flights at a time.", then click **Save**.

The approval chain itself is set up under Workflow → Approval Setup for the purpose **Golf group booking**; with no chain, submitting a booking approves it at once.
Its step conditions can test, among others, the share of the day a booking takes, the share all groups hold after it, the bill total, the discount against catalog and the deposit percentage.
The clocks run on the server: a tentative booking whose hold runs out loses its flights, and an approved booking whose deposit is not in by the pay-by date lapses; whoever created the booking is notified either way.

### Change the tee-sheet colours

1. Open **Tee Sheet**.
2. Pick a colour for each player state shown on the Tee Time Sheet: **Booked** (not yet arrived), **Registered**, **Billed** (bill open) and **Settled**.
3. Click **Save**.

Each player on the tee sheet appears as one dot in the colour of their state; a blank outline is a free seat.

## Field reference

### Booking Rules

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Advance Booking Days** | Yes | How many days before the play date bookings open, for members and public golfers alike, e.g. `7`. | Whole number from 0 to 365. |
| **Advance Booking Hours** | Yes | How many hours before midnight the next day's window opens early, e.g. `2` opens it at 10:00 pm; `0` opens it at midnight. | Whole number from 0 to 23; applies club-wide and cannot be overridden per membership type. |
| **Allow Membership Type to override the advance booking days** | No | Tick to let selected membership types book earlier than the general rule. | Reveals the override table; lines are kept while off but ignored. |
| **Override - Membership Type** | Yes (per line) | The membership type that gets its own window. | Each membership type may appear once. |
| **Override - Days** | Yes (per line) | That type's advance booking days, e.g. `14`. | Whole number from 0 to 365. |
| **Booking Lock (minutes)** | Yes | How long a selected flight is held while the player list is keyed; a countdown shows on the Booking screen. | Whole number from 1 to 60. |
| **Allow merge booking** | No | Tick to let players from different bookings share a flight until its seats are full. | When off, the first confirmed booking claims the whole flight. |
| **Weekday booking limit** | Yes | No limit, One booking per day, or One booking per session. | Per session needs at least one Session defined. |
| **Weekend & holiday booking limit** | Yes | The same choice for weekends and public holidays. | Public holidays always count as weekend. |
| **Sessions - Name** | Yes (per line) | The club's label for the day part, e.g. `Morning`. | Up to 50 characters; each name once. |
| **Sessions - From / Until** | Yes (per line) | The session's time band; Until is not included in the band. | From must be before Until; sessions may not overlap. |
| **Allow same-day booking** | No | Tick to let today's flights be booked. | When off, bookings start from tomorrow and today's flights are taken by registering at the Front Desk. |
| **Junior booking control** | No | Tick to require a junior member (a son, daughter or ward dependent) to play with their principal, or with an adult member when no principal is on record. | The Booking screen refuses; the Front Desk warns. |

### Minimum Players

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Weekday Minimum** | Yes | The fewest players a weekday booking must bring, e.g. `2`; `1` means no restriction. | Whole number from 1 to 10. |
| **Weekend & Holiday Minimum** | Yes | The same for weekends and public holidays. | Whole number from 1 to 10. |
| **Exception - Course** | No | The course the row applies to, or Every course. | Type to search the course list. |
| **Exception - Days** | Yes (per line) | All days, Weekday, Weekend & Holiday, or a specific day of the week. | A specific day outranks Weekday / Weekend & Holiday. |
| **Exception - From / To** | No | A flight-time band; leave both empty for the whole day. | Both or neither; From must be before To; rows with the same course and days may not overlap. |
| **Exception - Min** | Yes (per line) | The minimum for that scope. | Whole number from 1 to 10. |

### Guest Control

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable guest control** | No | The master switch; off = guests always welcome. | Reveals the settings below. |
| **Allow guest (visitor)** (Weekday / Weekend & Holiday) | No | Whether bookings may include visitors on that day type. | Ticked by default. |
| **Allow member as guest** (Weekday / Weekend & Holiday) | No | Whether a member may play under another member's booking on that day type. | Ticked by default. |
| **Exception - Course / Days / From / To** | As above | The scope of the exception, same rules as the Minimum Players exceptions. | Most specific row wins. |
| **Exception - Guest / Member guest** | No | The two answers for that scope. | Untick to forbid. |

### Handicap Control

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable handicap control** | No | The master switch; rules are kept while off. | Reveals both rule tables. |
| **Limit - Course / Days** | As above | The scope of the cap. | One limit per course, days, holes and gender combination. |
| **Limit - Holes** | No | 9, 18 or Any. | |
| **Limit - Gender** | No | Men, Ladies or Any. | A golfer of unknown gender takes the stricter matching cap. |
| **Limit - Max hcp** | Yes (per line) | The highest handicap index allowed, e.g. `36.0`. | 0.0 to 54.0, one decimal. |
| **Limit - Latest tee-off** | No | The latest start time for golfers under this cap. | A valid time of day. |
| **Accompaniment - Course / Days / Holes / From / To** | As above | The scope of the rule. | Rows with the same course, days and holes may not overlap in time. |
| **Accompaniment - Beg / Prov** | At least one | Which golfers the rule targets: Beginners, Provisional, or both. | |
| **Accompaniment - Min** | Yes (per line) | How many Established companions the flight must carry. | Whole number from 1 to 3. |
| **Accompaniment - Men ≤ / Ladies ≤** | Yes (per line) | The highest handicap index a companion may have, by gender, e.g. `24.0` / `36.0`. | 0.0 to 54.0. |
| **Accompaniment - Latest tee-off** | No | The latest start time for the targeted golfers. | A valid time of day. |

### Cancellation & No-show

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable cancellation & no-show control** | No | The master switch; off = bookings cancel any time and nobody is charged. | Turning it on needs a No-show Charge picked. |
| **Cancellation Notice (hours)** | Yes | The notice a cancellation needs before the booking's first tee time, e.g. `24`; `0` means no notice rule. | Whole number from 0 to 720. |
| **Late Cancellation** | Yes | Allow and charge the penalty, or refuse the cancellation. | |
| **No-show Charge** | Yes (while on) | The Transaction Type of charge type No Show Charges that prices the penalty. | Must be one of this club's No Show Charges types and active while the control is on. |
| **Charge Basis** | Yes | Per no-show player, or Per booking. | |

### Rain Checks

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable rain checks** | No | The master switch; off = the Tee Time Sheet offers no Issue rain check. | Open rain checks already issued can still be redeemed. |
| **Valid for (days)** | Yes (while on) | Days from issue until an unredeemed rain check expires, e.g. `90`. | Whole number from 1 to 730. |
| **Value Basis** | Yes | Green-fee lines only, or The whole bill. | |
| **Prorate by holes not played** | No | Ticked = value times the unplayed share; unticked = the full basis. | On by default. |

### Playing Rights & Round Quotas

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable playing rights & round quotas** | No | The master switch; rows are kept while off. | Reveals both tables. |
| **Playing right - Target** | Yes (per row) | A player type, or an affiliated or reciprocal club. | Every row needs one. |
| **Playing right - Membership type** | No | Narrows a member-base target to one membership type. | Shown only for member-base player types; blank = every membership type. |
| **Playing right - Course / Days / From / To** | Days yes | The allowance's scope. | A time band needs both times; From before To. |
| **Playing right - Valid from / Valid to** | No | When the allowance applies. | Blank = permanent; the end cannot precede the start. |
| **Round quota - Target / Membership type** | Yes (per row) | As above. | One row per target, membership type, days and period. |
| **Round quota - Days** | Yes | Which days the rounds count on. | All, weekday, weekend and holiday, or a specific day. |
| **Round quota - Period** | Yes | Per week (Monday to Sunday), per calendar month or per calendar year. | |
| **Round quota - Max rounds** | Yes | The most booked or registered rounds in the period. | Whole number from 1 to 999. |
| **Round quota - Max guest rounds** | No | The most guest lines on that member's own bookings in the period. | Whole number from 0 to 999; blank = no cap. |

### Group Bookings

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable group booking control** | No | The master switch; off = a group booking is confirmed at creation with no holds, approval or deposit clock. | Reveals the three timers below and the two per-user fields under Share caps; all five are kept while off. |
| **Tentative Hold (hours)** | Yes (while on) | How long a tentative booking's reserved flights hold the tee sheet before they are released unless it is submitted, e.g. `72`; `0` = no expiry. | Whole number from 0 to 720. |
| **Deposit Due (days after approval)** | Yes (while on) | The default pay-by date of the deposit, counted from approval, e.g. `7`. | Whole number from 0 to 365; a manager may extend a booking's date once. |
| **Default Deposit (% of the group bill)** | Yes (while on) | The deposit demanded when the proforma does not state one, e.g. `30`; `0` = none, approval confirms at once. | Whole number from 0 to 100. |
| **Weekday Group Share Cap (%)** | Yes | The most of a course's tee times all groups together may hold on a weekday, e.g. `40`; `0` = no cap. | Whole number from 0 to 100; always visible and applies in both modes; club events are exempt. |
| **Weekend & Holiday Group Share Cap (%)** | Yes | The same for weekends and public holidays, e.g. `25`. | Whole number from 0 to 100. |
| **Tentative Bookings per User** | Yes (while on) | How many tentative bookings with reserved flights one user may hold at a time, e.g. `3`; `0` = no limit. | Whole number from 0 to 50. |
| **Next in Line (hours)** | Yes (while on) | The exclusive window the first group on a day's waitlist has to reserve it once the day frees up, e.g. `24`. | Whole number from 1 to 168; other groups are refused meanwhile, members never. |

### Tee Sheet

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Booked / Registered / Billed / Settled** | Yes | The dot colour for each player state on the Tee Time Sheet. | Pick from the colour control; defaults are blue, amber, violet and green. |

## Tips & troubleshooting

- The **Save** button stays grey until you change something; after a successful save the screen reloads with the saved values.
- If you see "Define at least one session before limiting bookings per session", add at least one row under **Sessions** or set the limit back to per day.
- If you see "Every session needs a name.", "Session 'Morning' needs both From and Until times." or "Session 'Morning': the From time must be before the Until time.", complete that session row before saving.
- If you see "Every override line needs a membership type.", pick a type on each override row or remove the empty row.
- If you see "A minimum-player rule needs both From and To times - or neither for the whole day." (or the guest, handicap or accompaniment version) or "...From time must be before its To time.", fix the time band on that row.
- If you see "Sessions 'Morning' and 'Afternoon' overlap", adjust the times so each band ends where the next begins.
- If you see "A membership type can only have one override line", remove the duplicate line.
- If you see "Two minimum-player rules cover the same course and day scope for the whole day" or "...have overlapping time bands", two exceptions compete for the same slot - merge them or narrow one.
- If you see "Two handicap limit rules cover the same course, day scope, holes and gender", keep one limit per combination.
- If you see "An accompaniment rule must target beginners, provisional golfers, or both", tick **Beg** or **Prov** on that row.
- If you see "Pick the no-show transaction type before switching cancellation & no-show control on", create a Transaction Type with charge type No Show Charges (with a flat price) first, then select it here.
- If you see "The no-show transaction type is inactive", re-enable that type or pick another before switching the control on.
- The no-show penalty posts to the booker's account only when an Account Receivable invoice transaction type is opened to the Golf module; until then charges wait as Pending on the No-show Charges screen.
- If you see "Rain check validity must be a whole number of days between 1 and 730.", correct the **Valid for (days)** field.
- Switching rain checks off does not void rain checks already issued; cancel those on the Rain Checks screen if they should not stand.
- If you see "Each playing-right rule targets either a player type or an affiliated club." or "Every playing-right and round-quota rule needs a target", pick the target on every row.
- If you see "A playing-right rule can name a membership type only for a member-base player type.", clear the membership type on that row.
- If you see "Two round-quota rules name the same target, membership type, day scope and period.", merge the duplicate rows.
- A player type that needs restricting but has no rows is unrestricted; add at least one playing-right row before relying on the switch.
- A preview under the advance-booking fields disappears while a number is out of range - fix the red field message first.

## Related options

- Golf Management → Golf Booking - applies the window, limits, minimum players, guest, handicap and junior rules, and shows the late-cancellation charge before a cancel is confirmed.
- Golf Management → Front Desk → Tee Time Sheet - registers with warnings, uses the tee-sheet colours, and runs the **No-shows** review.
- Golf Management → Front Desk → No-show Charges - the penalties raised under the Cancellation & No-show rules.
- Golf Management → Front Desk → Rain Checks - the rain checks issued under the Rain Checks rule.
- Golf Management → Common Setup → Player Types and Affiliated Clubs - the targets of the playing-right and round-quota rules.
- Golf Management → Transaction Type - the No Show Charges type and its price card.
- Golf Management → Golfers - handicap index and status read by Handicap Control.
- Golf Management → Group Bookings - follows the Group Bookings control: tentative holds, submission for approval, the deposit deadline and lapse.
- Workflow → Approval Setup - the chain for the purpose Golf group booking.
- Membership Management → Membership Type - the guest quota per booking.
- System Setup → Companies → Weekend days, and Public Holidays - decide which dates count as weekend.
