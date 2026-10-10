# Courses

> **Where:** Golf Management → Courses
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New course button needs the Create permission; Edit, Tee times and Enable/Disable need the Edit permission; Delete needs the Delete permission.

## What this option is for

The Courses screen defines the 18-hole courses golfers book: each course pairs two nines (unit courses) - a **first nine** players tee off on and a **second nine** they cross over to - with an optional alternate nine, an optional floodlit night nine, the cross over time and a course picture.
Any active nine may sit in either seat, so a 27-hole club can set up rotation courses such as East 1 → East 2, East 2 → West 3 and West 3 → East 1.
Each course also owns its **tee-time sets** - the flight schedule (first and last tee-off, interval, players per flight) for weekdays, weekends or all days, versioned by effective date - and the individual **flight times** generated from a set.
The tee sheet shown on the Golf Booking and Tee Time Sheet screens is built live from this setup, so staff come here after creating the unit courses and before taking the first booking, and again whenever the flight schedule changes (for example a shorter day in the rainy season).

## The screen at a glance

[Screenshot: Courses list]

- A count line shows how many courses exist and how many are active.
- A search box filters the list as you type; it matches the course code, the description and the codes of the first and second nine.
- Each course is a card showing its picture (if uploaded), the code as the title, the description, and the nines: **First**, **Second**, **Alternate**, **Night**, plus the **Cross over** time in minutes.
- A status chip at the top right shows **Active** or **Disabled**; active courses are listed first.
- Each card has an **Edit** button and a ⋮ menu holding **Tee times**, **Enable** or **Disable**, and **Delete**.
- The **New course** button floats at the bottom right of the screen.

## Common tasks

### Add a course

[Screenshot: New course dialog]

1. Click **New course**.
2. Enter the **Course code** (e.g. `ELS`) and optionally a **Display sequence** and a **Description**.
3. Pick the **First nine** and the **Second nine** - type a few letters to filter the list; they must be two different nines.
4. Optionally pick an **Alternate nine** and, for night golf, a **Night nine** (only floodlit nines are offered).
5. Enter the **Cross over time (minutes)** - how long after tee-off players reach the second nine; it fixes the crossover time of every 18-hole flight.
6. Optionally click **Upload picture**.
7. Click **Save**.

The course appears as Active.
It cannot be booked until it has a tee-time set with generated flight times (next task).

### Set up the flight schedule (tee-time sets)

[Screenshot: Tee times dialog - list of sets]

1. Open the course's ⋮ menu and click **Tee times**.
2. Click **Add tee-time set**.
3. Pick the **Day scope** (**All days**, **Weekdays** or **Weekends**; public holidays count as weekends) and the **Effective date** the set applies from.
4. Enter the **First tee-off**, **Last tee-off**, **Flight interval (minutes)** and **Players per flight**.
5. Optionally set **Must play 18 holes until**, **Must play 9 holes until** and **Front desk from**.
6. Click **Save**; the dialog returns to the list of sets.

Each set shows its scope and effective date, a status chip, the description, and a summary line (first-last tee-off, interval, players, slot count and the front-desk-from time).
On a given play date the system uses the set whose scope matches the day (an exact Weekdays or Weekends set wins over an All days set) with the latest effective date on or before that date.
To change the schedule from a future date, add a new set with that effective date rather than editing the one in force.

### Generate the flight times

[Screenshot: Flight times dialog]

1. In the Tee times list, click **Flight times (n)** on the set.
2. Click **Generate n flights (first-last every x min)** - the button states how many flights the set's header will produce.
   Flights from the **Front desk from** time onward are pre-ticked as **Front desk**.
3. Adjust individual rows if needed: the **Tee-off** time, the **Players** (1-10), and the two roles:
   - **Front desk** - no advance bookings; the time is for walk-ins at the counter only.
   - **X-over** - closed for crossover: no new tee-offs at all; the time exists only for 18-hole flights to land on their second nine.
   Ticking one role clears the other.
4. Click **Save n flights**.

Saving replaces the set's whole flight list with what you see.
Changing the set's header later does not regenerate the flights - open Flight times and click **Regenerate** to rebuild them, then save.

### Edit, disable or delete a course

- Click **Edit** to change any course field; the Course code is stored in capitals.
- Open the ⋮ menu and click **Disable** to take a course off the tee sheet while keeping its history, or **Enable** to bring it back.
- Open the ⋮ menu and click **Delete** only for a course keyed by mistake: the confirmation names the course and warns that its tee-time sets are removed with it.
  Click **Delete** to confirm or **Keep** to back out.
  A course that already has bookings or player records cannot be deleted; disable it instead.

### Edit, disable or enable a tee-time set

- In the Tee times list, open the set's ⋮ menu and click **Edit** to change its header, **Disable** to stop it being used (a disabled set is ignored when the tee sheet is built), or **Enable** to put it back.

If you leave any dialog with unsaved changes (Cancel, Back to list, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

## Field reference

### New / Edit course dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Course code** | Yes | A short code for the course, e.g. `ELS`; shown on bookings, the tee sheet and emails. | Up to 20 characters; stored in capitals; must be unique in your company. |
| **Display sequence** | No | The order courses are listed in pickers and on the tee sheet. | A whole number from 1 to 999. |
| **Description** | No | The course name, e.g. `Els Course`. | Up to 255 characters. |
| **First nine** | Yes | The nine players tee off on. | An active nine of your company. |
| **Second nine** | Yes | The nine players cross over to after the first nine. | An active nine, different from the first nine. |
| **Alternate nine** | No | A standby nine recorded for this course. | An active nine, or None. |
| **Night nine (after dark)** | No | The floodlit nine used after dark. | Only nines marked Floodlit on Unit Courses are offered. |
| **Cross over time (minutes)** | No | Minutes from tee-off until players cross over to the second nine, e.g. `120`. It sets the crossover slot of every 18-hole flight, which also occupies a seat on the second nine's sheet. | A whole number from 1 to 600. |
| **Course picture** | No | A photo of the course. | Image file; upload, replace or remove; kept when you click Save. |

### New / Edit tee-time set dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Day scope** | Yes | Which days the set applies to: **All days**, **Weekdays** or **Weekends**; public holidays count as weekends. | One set per day scope and effective date on a course. |
| **Effective date** | Yes | The first play date this set applies from. | Picked from the calendar. |
| **Description** | No | A label for the schedule, e.g. `Summer schedule`. | Up to 255 characters. |
| **First tee-off** | Yes | The first flight time of the day, e.g. `07:00`. | A time of day. |
| **Last tee-off** | Yes | The last flight time of the day, e.g. `17:00`. | Must be after the first tee-off. |
| **Flight interval (minutes)** | Yes | Minutes between flights, e.g. `8`. | A whole number from 1 to 120. |
| **Players per flight** | Yes | The default seats per flight; each generated flight starts with this. | A whole number from 1 to 10; default 4. |
| **Must play 18 holes until** | No | Up to this tee-off time only 18-hole play is offered; 9-hole bookings are not shown for earlier flights. | A time of day; leave empty for no rule. |
| **Must play 9 holes until** | No | Recorded for the club's reference. | A time of day; leave empty for no rule. |
| **Front desk from** | No | From this time onward generated flights are marked **Front desk** (walk-ins only). | A time of day; applied when flights are generated. |

### Flight times dialog (one row per flight)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **#** | - | Shown, not entered: the flight's number in the set. | Each number appears once; up to 300 flights per set. |
| **Tee-off** | Yes | The flight's tee-off time. | A time of day. |
| **Players** | Yes | Seats on this flight. | A whole number from 1 to 10. |
| **Front desk** | No | Tick to reserve the flight for walk-in registration at the counter; it is never offered to advance bookings. | Ticking it clears X-over. |
| **X-over** | No | Tick to close the time for new tee-offs from any channel; 18-hole flights may still land on it as their crossover. | Ticking it clears Front desk. |

## Tips & troubleshooting

- If you see "Course 'X' already exists." another course in your company already uses that code.
- If you see "First nine and second nine must be two different unit courses." pick two different nines.
- If you see "Night nine (X) must be a floodlit unit course." mark the nine as Floodlit on Unit Courses first, or pick another nine.
- If you see "<Nine> (X) is disabled." or "<Nine> is not one of this company's unit courses." the picked nine is disabled or belongs elsewhere; enable it on Unit Courses or pick another.
- If you see "Display sequence must be a whole number between 1 and 999." or "Cross over time must be a whole number of minutes between 1 and 600." correct the number.
- If you see "This course already has a set for that day scope and effective date." edit that set or pick a different effective date.
- If you see "Last tee-off time must be after the first tee-off time." the set's window is reversed.
- If you see "Flight interval must be a whole number of minutes between 1 and 120." or "Players per flight must be a whole number between 1 and 10." correct the set header.
- If you see "Slot n: tee-off time is required." or "Slot n: players must be between 1 and 10." fix that row of the flight list.
- If you see "A tee-time set cannot have more than 300 slots." widen the interval or shorten the day.
- If you see "Cannot delete X - n booking(s) and n player record(s) reference it. Disable the course instead." the course has history; use Disable.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- A course with no active tee-time set, or a set with no saved flights, shows no flights on the booking screen and the tee sheet.
- Set the course's cross over time before generating flights on the courses that share its second nine: a crossover landing occupies a seat on that nine's sheet at the landing time.
- Deleting a nine on Unit Courses is refused while any course uses it in any seat; change the course first.

## Related options

- Golf Management → Unit Courses - the nines, their holes and tee boxes, and the Floodlit flag the Night nine needs.
- Golf Management → Course Closure - closes a nine for maintenance or tournaments; flights on it are blocked regardless of the course.
- Golf Management → Golf Specification - the booking rules applied on top of this schedule (advance window, merge, minimum players, guest control, sessions).
- Golf Management → Golf Booking - searches the flights generated here.
- Golf Management → Front Desk → Tee Time Sheet - shows each course's flights for the day, including Front desk and X-over times.
- System Setup → Companies → Weekend days and System Setup → Public Holidays - decide which dates are weekdays and weekends for the day scope.
