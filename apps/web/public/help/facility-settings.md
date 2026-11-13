# Facility Specification

> **Where:** Facility Management → Facility Specification
>
> **Who can use it:** users whose role includes the Facility Management module.
> The save bar (**Save** and **Discard changes**) appears only when your role holds the Edit permission for this screen; without it you can read the settings but not store a change.

## What this option is for

The Facility Specification holds the club-wide rules that the Facility Bookings and Control Station screens apply automatically.
There is one specification per club (company): how far in advance a slot may be booked, the club's day sessions (peak and off-peak), whether members may bring guests, the cancellation notice and the no-show penalty, how the Control Station checks people in and serves a guest keyed at the counter, and whether classes are in use.
Staff come here when the club changes a policy.
The numbers set here are the general rule; a facility type can carry its own advance booking days, guest policy and charge and strike switches under Facility Types.

## The screen at a glance

[Screenshot: Facility Specification screen with all six cards expanded]

- The screen is one form made of six collapsible cards: **Booking Window**, **Sessions**, **Guest Control**, **Cancellation and No-show**, **Control Station** and **Classes**.
- Click a card's header band to fold it away or open it again; folding never loses what you typed.
- Many labels carry an (i) that opens the full explanation of that setting.
- Some switches reveal more fields when turned on (the membership type overrides, the guest answers, the cancellation and no-show fields, the class fields).
- Three cards carry a small table you build yourself: **Add override** (Booking Window), **Add session** (Sessions) and **Add exception** (Guest Control).
  Each row has a red ✕ button that removes it.
- A sticky bar reading **Unsaved changes**, with **Discard changes** and **Save**, appears at the bottom as soon as you change something.
- A green message confirms the save; a red message explains what the system refused.

## Common tasks

### Set the booking window

1. Open **Booking Window**.
2. Enter the **Advance Booking Days** (e.g. `7` for a seven-day window).
3. Enter the **Advance Booking Hours** if the club opens each day's window some hours before midnight; leave it at `0` to open at midnight.
4. Read the preview line under the two fields - it states the rule in words, e.g. "Bookings for a date open 7 day(s) before, at 12:00 midnight." or "Bookings for a date open 7 day(s) before - and already the previous evening from 10:00 pm (2 hour(s) before midnight)."
5. Enter the **Booking Lock (minutes)** - how long a picked slot is held for the person keying the booking; a countdown shows on the booking screen.
6. Tick **Allow same-day booking - today's slots can be booked** if today's slots may be booked.
   When it is not ticked, bookings start from tomorrow and today's slots are taken by registering at the Control Station.
7. Click **Save**.

To let certain membership types book earlier than everyone else:

1. Switch **Allow Membership Type to override the advance booking days** on.
2. Click **Add override**, pick the **Membership Type** and enter its own **Days**.
   A new line starts with the general Advance Booking Days.
3. Click **Save**.

An override beats both the general days and a facility type's own days.
The Advance Booking Hours always apply club-wide.
The override table is shown only while the switch is on, and its lines take effect only while the switch is on.

### Define the day sessions

1. Open **Sessions**.
2. Click **Add session** and fill the row: a **Name** (e.g. `Morning`, `Evening` or `Peak`), the **From** time and the **Until** time.
3. Repeat for each day part.
   The Until time is not included: a 17:00 - 22:00 session owns slots starting 17:00 to 21:59, so the next session may start at 22:00.
4. Click **Save**.

Sessions are the club's day parts.
Each facility fee can carry a different price per session (peak and off-peak), and a booking limit can be counted per session.
A slot that falls outside every session is unrestricted.
With no sessions at all, every slot is priced and counted the same across the day.

### Control guests

1. Open **Guest Control** and switch **Enable guest control** on.
   While it is off, guests are not restricted on any facility.
2. Under **Weekdays** and under **Weekends and public holidays**, tick or untick **Visitor guests allowed** and **Members may join another member's booking**.
3. For a facility type, a day or a time band that needs a different answer, click **Add exception** and fill the row: the **Facility type** (or leave it on Every type), the **Days**, optional **From** and **To** times (leave both empty for the whole day), and the **Guest** and **Member guest** tick boxes.
4. Click **Save**.

When several exceptions could apply, the most specific wins: a named facility type beats Every type, a specific day (e.g. Sunday) beats Weekday or Weekend and holiday, which beat All days, and a time band beats the whole day.
A facility type's own guest policy and its guest cap still apply on top, and guests count against the member's monthly guest allowance set on the Membership Type.
Limits per type (guests per booking, host must be present) are set on each facility type, not here.

### Set the cancellation notice and no-show penalty

1. Open **Cancellation and No-show** and switch **Enable cancellation notice and no-show control** on.
   While it is off, bookings cancel at any time without penalty.
2. Enter the **Cancellation Notice (hours)** - a cancellation closer than this to the slot is a late cancellation (`0` means no notice rule).
3. Choose what a **Late cancellation** does:
   - **Charge the booker** - the cancellation goes through and the late cancellation charge is raised to the booker.
   - **Refuse the cancellation** - the booking channel refuses the cancellation; the desk may still cancel with the charge waived and a reason.
4. Pick the **No-show charge item** - a transaction type of charge type No Show Charges, priced by its flat price.
   Leave it empty to use the facility type's own no-show item or, failing that, the general one.
5. Choose the **Charge basis**: **Per booking**, **Per missed slot** or **Per participant**.
   The item's flat price is charged once per unit of the basis.
6. Enter the **No-show grace (minutes)** - how long after its start a booked slot may be recorded as a no-show.
7. Under **Strikes**, enter **No-shows to suspend**, **Within (days)** and **Suspension (days)**.
   Reaching that many no-shows inside that many days suspends the member from booking every facility for the suspension days; the office may lift a suspension early.
8. Click **Save**.

Each facility type switches its own charge and its own strike on or off under Facility Types; a no-show counts as a strike only on types with the strike switch on.

### Set how the Control Station behaves

1. Open **Control Station**.
2. Enter **Check-in opens (minutes before the slot)**.
   The Control Station checks a booked slot in from this many minutes before its start until the slot ends.
3. Switch **Sign everyone out at the type's close time** on to have the system sign out every registration still in at each facility type's close time, so the register never carries yesterday's names.
   When it is off, the desk signs everyone out by hand under End of day.
4. Decide how a guest who arrives without a pass, and is keyed in at the station while the member is at the counter, is served:
   - **Give a day pass to a guest keyed at the station** - when on, a guest keyed with a mobile or an email is registered with Membership and gets the day pass, so later that day they can come back to the station on their own.
     When off, every guest keyed at the station is served by name, together with the member.
   - **A guest keyed at the station must give a mobile or an email** - when on, the station refuses a guest keyed without a mobile or an email, so every guest is known and counted once.
     When off, a guest may be served by name alone, and every later item again needs the member at the counter.
5. Click **Save**.

### Turn classes on

1. Open **Classes** and switch **Enable classes** on.
   When on, the Venues, Instructors, Classes and Class Schedule screens take actions, the Control Station shows the day's classes, and a class session on a court blocks its booking cells.
   When off, those screens show a notice and sessions already scheduled are kept.
2. Enter the **Class cancellation notice (hours)** - a seat cancelled closer than this to the session start is a late cancellation and its fee stands; outside the notice an unsettled bill is voided.
   A class may set its own notice, and `0` means no notice rule.
3. Enter **Waitlist offer held for (hours)** - when a seat frees on a full session or term, the first person in the queue is offered it by email and the seat is held this long; then the offer lapses and the next person is offered.
4. Click **Save**.

### Save or discard

- **Save** stores every card at once and answers "Facility specification saved."
- **Discard changes** throws away what you changed and reloads the saved settings.
- If a number is empty or out of range, the field shows a red message such as "Enter a whole number between 0 and 365." and nothing is saved until you correct it.
- If you leave the screen with unsaved changes, the system asks "Discard unsaved changes?" - choose **Discard changes** to leave or **Keep editing** to stay.
  Refreshing or closing the browser tab shows the browser's own warning.

## Field reference

### Booking Window

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Advance Booking Days** | Yes | How many days before a date its slots open for booking; the general rule for every facility type. | A whole number from 0 to 365; starts at 7. A facility type may set its own days. |
| **Advance Booking Hours** | Yes | Opens the daily window this many hours before midnight, e.g. `2` opens it at 10:00 pm the evening before. | A whole number from 0 to 23; starts at 0. Applies club-wide. |
| **Booking Lock (minutes)** | Yes | How long a selected slot is held while the booking is keyed. | A whole number from 1 to 60; starts at 5. |
| **Allow same-day booking - today's slots can be booked** | No | Tick to let today's slots be booked. | Not ticked at first: bookings start from tomorrow. |
| **Allow Membership Type to override the advance booking days** | No | Switch on to give selected membership types their own, earlier booking window. | Off at first. Reveals the override table. |
| **Membership Type** (override line) | Yes | The membership type that gets its own window. | Each membership type can have only one line; at most 100 lines. |
| **Days** (override line) | Yes | That membership type's advance booking days. | A whole number from 0 to 365. |

### Sessions

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Name** | Yes | The name of the day part, e.g. `Morning`. | Up to 50 characters; each name only once (capitals do not make a different name). |
| **From** | Yes | The time the session starts. | Must be before Until. |
| **Until** | Yes | The time the session ends; this time itself is not included. | Sessions must not overlap; at most 20 sessions. |

### Guest Control

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable guest control** | No | Switch on to restrict guests; off means nothing restricts guests anywhere. | Off at first. Reveals the fields below. |
| **Weekdays - Visitor guests allowed** | No | Tick if visitors may come as guests on weekdays. | Ticked at first. |
| **Weekdays - Members may join another member's booking** | No | Tick if a member may take part in another member's booking on weekdays. | Ticked at first. |
| **Weekends and public holidays - Visitor guests allowed** | No | The same answer for weekends and public holidays. | Ticked at first. |
| **Weekends and public holidays - Members may join another member's booking** | No | The same answer for weekends and public holidays. | Ticked at first. |
| **Facility type** (exception) | No | The facility type the exception is for; leave empty for Every type. | Must be one of your company's facility types. |
| **Days** (exception) | Yes | **All days**, **Weekday**, **Weekend and holiday** or one day from Monday to Sunday. | Starts on All days. |
| **From** / **To** (exception) | No | The time band the exception covers; leave both empty for the whole day. | Enter both or neither; From must be before To. |
| **Guest** (exception) | No | Tick if visitor guests are allowed in this case. | Ticked on a new row. |
| **Member guest** (exception) | No | Tick if members may join another member's booking in this case. | Ticked on a new row. |

Two exceptions for the same facility type and the same Days may not both cover the whole day, and their time bands may not overlap.
You can keep at most 200 exceptions.

### Cancellation and No-show

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable cancellation notice and no-show control** | No | Switch on to apply the notice, the no-show charge and the strikes. | Off at first. Reveals the fields below. |
| **Cancellation Notice (hours)** | Yes | The notice a cancellation needs before the slot, e.g. `24`. | A whole number from 0 to 720; starts at 24; 0 means no notice rule. |
| **Late cancellation** | No | **Charge the booker** or **Refuse the cancellation**. | Starts on Charge the booker. |
| **No-show charge item** | No | The No Show Charges transaction type that prices the penalty. | Only active No Show Charges transaction types are listed; empty uses the facility type's own or the general no-show item. |
| **Charge basis** | No | **Per booking**, **Per missed slot** or **Per participant**. | Starts on Per booking. |
| **No-show grace (minutes)** | Yes | How long after its start a booked slot may be recorded as a no-show. | A whole number from 0 to 240; starts at 15. |
| **No-shows to suspend** | Yes | How many no-shows lead to a suspension. | A whole number from 1 to 20; starts at 3. |
| **Within (days)** | Yes | The period in which those no-shows are counted. | A whole number from 1 to 365; starts at 90. |
| **Suspension (days)** | Yes | How long the member is suspended from booking. | A whole number from 1 to 365; starts at 30. |

### Control Station

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Check-in opens (minutes before the slot)** | Yes | How early a booked slot can be checked in; check-in stays open until the slot ends. | A whole number from 0 to 240; starts at 30. |
| **Sign everyone out at the type's close time** | No | On = the system signs out everyone still in at each facility type's close time; off = the desk does it by hand under End of day. | On at first. |
| **Give a day pass to a guest keyed at the station** | No | On = a guest keyed with a mobile or an email is registered with Membership and gets the day pass; off = every keyed guest is served by name, together with the member. | On at first. |
| **A guest keyed at the station must give a mobile or an email** | No | On = the station refuses a guest keyed without a mobile or an email; off = a guest may be served by name alone. | Off at first. |

### Classes

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enable classes** | No | Switch on to use the class screens and show classes at the Control Station. | Off at first. Reveals the fields below. |
| **Class cancellation notice (hours)** | Yes | Inside this notice a cancelled seat keeps its fee. | A whole number from 0 to 720; starts at 24; 0 means no notice rule. |
| **Waitlist offer held for (hours)** | Yes | How long an offered seat is held before it passes to the next person in the queue. | A whole number from 1 to 168; starts at 24. |

## Tips & troubleshooting

- If you click **Save** and nothing happens, a number somewhere is empty or out of range.
  Open every card and switch on the groups that hide fields, then look for a red message; the three **Strikes** numbers show no message of their own, so check them too.
- If you see "Every session needs a name." or "Session 'X' needs both From and Until times." complete that session row or remove it.
- If you see "Session 'X' appears more than once." two sessions share a name; rename one.
- If you see "Session 'X': the From time must be before the Until time." correct the two times.
- If you see "Sessions 'A' and 'B' overlap." move one session's times so the next begins when the previous ends.
- If you see "At most 20 sessions." remove a session.
- If you see "Every override line needs a membership type." pick the membership type on the empty line or remove the line.
- If you see "A membership type can only have one override line." the same membership type was picked twice.
- If you see "An override line is not one of this company's membership types." remove that line and pick the membership type again.
- If you see "Too many override lines." you have more than 100 override lines.
- If you see "A guest rule needs both From and To times - or neither for the whole day." fill the missing time or clear both.
- If you see "A guest rule's From time must be before its To time." correct the two times.
- If you see "Two guest-control rules cover the same facility type and day scope for the whole day." two exceptions say the same thing for the same case; remove one or give them time bands.
- If you see "Two guest-control rules for the same facility type and day scope have overlapping time bands." adjust the From and To times so they do not overlap.
- If you see "Too many guest-control rules." you have more than 200 exceptions.
- If you see "The no-show item must be a No Show Charges transaction type of the active company." pick the No-show charge item again from the list.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- Which days count as a weekend comes from the company's weekend days, and public holidays are treated as weekend days.
- Turning a switch off does not erase what sits under it: the membership type overrides, the guest answers and exceptions and the no-show numbers are kept and apply again when the switch is turned back on.

## Related options

- Facility Management → Facility Types - a type's own advance booking days, guest policy and guest cap, and its charge and strike switches.
- Facility Management → Facility Bookings - applies the booking window, the booking lock, guest control and the cancellation notice.
- Facility Management → Control Station - applies the check-in window, the sign-out, the guest switches and the no-show review.
- Facility Management → Transaction Types - the No Show Charges item and the fees priced per session.
- Facility Management → No-show Charges and Booking Suspensions - follow up the penalties and suspensions these rules produce.
- Facility Management → Venues, Instructors, Classes and Class Schedule - the screens the Classes switch turns on.
- Membership Management → Membership Type - the monthly guest allowance guests count against.
- Membership Management → Guest Registration - guest registrations and day passes; a guest given a day pass at the station is registered with Membership.
- System Setup → Companies (weekend days) and Public Holidays - decide which days are weekdays, weekends and holidays.
