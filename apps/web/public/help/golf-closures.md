# Course Closure

> **Where:** Golf Management → Course Closure
>
> **Who can use it:** users whose role includes the Golf Management module and holds this menu.
> The New closure plan button needs the Create permission; Closure days, Edit and Enable/Disable need the Edit permission.

## What this option is for

The Course Closure screen records the periods when a nine is not available for play - greens maintenance every weekday morning, a tournament weekend, flood repairs - so the tee sheet stops offering those times.
A closure is a fact about the physical nine (the unit course), not about an 18-hole course: when a nine is closed, every course that tees off on it is blocked at those times, and every 18-hole flight that would cross over onto it is blocked too.
A **closure plan** is the rule - which nine, a description, which days of the week, the date period and the daily closed window.
From the plan you **generate** the individual **closure days**, review them, except single days or adjust their times, and save; only the saved closure days actually block the tee sheet.
This menu is separate from the Unit Courses setup so maintenance schedulers can be granted closures without the setup screens.

## The screen at a glance

[Screenshot: Course Closure list]

- A count line shows how many closure plans exist and how many are active.
- A search box filters the list as you type; it matches the description, the nine's code or description, and the period dates (typed as year-month-day, e.g. `2026-11`).
- Each plan is a card: the description as the title, a chip with the nine's code and its description, then **Period**, **Days** (All days / Weekdays / Weekends), **Closed** (the daily window, or "All day") and **Closure days** (how many days are saved).
- A status chip at the top right shows **Active** or **Disabled**; active plans are listed first, newest period first.
- Each card has a **Closure days (n)** button and a ⋮ menu holding **Edit** and **Enable** or **Disable**.
- The **New closure plan** button floats at the bottom right of the screen.

## Common tasks

### Close a nine over a period

[Screenshot: New closure plan dialog]

1. Click **New closure plan**.
2. Under **Close**, tick the nine (or nines) to close.
   One plan is created per ticked nine; tick every nine for a whole-club shutdown.
3. Enter the **Description** (e.g. `Greens maintenance`).
4. Pick the **Day scope**: **All days**, **Weekdays** or **Weekends** (public holidays count as weekends).
5. Set the **Start date** and **End date** of the period.
6. To close only part of each day, set **Closed from** and **Closed until**; leave both empty to close for the whole day.
7. Click **Save** (the button reads **Save on n nines** when more than one nine is ticked).

The plan appears in the list with **0** closure days.
Nothing is blocked yet: generate and save the closure days next.

### Generate and save the closure days

[Screenshot: Closure days dialog]

1. Click **Closure days (n)** on the plan's card.
2. Click **Generate days (…)** - the button names the scope and period it will expand.
   The system lists every date in the period that matches the day scope, each tagged **Weekend** or **Holiday** where applicable, seeded with the plan's closed window.
3. Review the rows:
   - change a day's **From** / **Until** times (or clear both for a whole-day closure on that date);
   - untick **On** to keep a date in the list but not apply the closure that day;
   - click ✕ to remove a date altogether.
4. Click **Save n days**.

The saved days now block the tee sheet.
If you later change the plan's description, period, scope or times, the saved days are not changed automatically - open **Closure days** and click **Regenerate days** to rebuild them, then save.

### Edit a closure plan

1. Open the card's ⋮ menu and click **Edit**.
2. Change what you need.
   The **Unit course** is shown but cannot be changed; to move a closure to another nine, create a new plan for that nine and disable this one.
3. Click **Save**.

If you leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a closure plan

- Open the card's ⋮ menu and click **Disable** to lift the closure without deleting it.
  A disabled plan's days no longer block anything; the plan stays on this screen for history.
- Open the ⋮ menu and click **Enable** to put it back in force.

## Field reference

### New / Edit closure plan dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Close** | Yes (new plans) | The nine or nines to close; each ticked nine gets its own plan with the same header. Only active nines are offered. | At least one nine must be ticked. On an existing plan this shows as the read-only **Unit course**. |
| **Description** | Yes | What the closure is for, e.g. `Greens maintenance` or `Club Championship`. Shown on the card and in the day editor's title. | Up to 255 characters. |
| **Day scope** | Yes | Which days of the period the closure applies to: **All days**, **Weekdays** or **Weekends**. Weekday and weekend follow your company's Weekend Days setting, and public holidays count as weekends. | Fixed choices. |
| **Start date** | Yes | The first date of the period, picked from the calendar. | Must not be after the end date. |
| **End date** | Yes | The last date of the period, picked from the calendar. | A plan cannot span more than one year. |
| **Closed from** | No | The time of day the closure starts, e.g. `06:00`. | Set both times or neither; leave both empty for a whole-day closure. |
| **Closed until** | No | The time of day the closure ends, e.g. `12:00`. | Must be after **Closed from**. |

### Closure days dialog (one row per date)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Date** | - | Shown, not entered: the closure date with a **Weekend** or **Holiday** tag where applicable. | Each date may appear only once. |
| **From** / **Until** | No | The closed window on that date; seeded from the plan. | Set both or neither (whole day); Until must be after From. |
| **On** | No | Tick to apply the closure on that date; untick to except the date while keeping it in the list. | New rows start ticked. |
| ✕ | - | Removes the date from the list. | Regenerating brings it back. |

## Tips & troubleshooting

- If you see "Pick at least one unit course to close." no nine is ticked under **Close**.
- If you see "Description, day scope and the date period are required." fill in the four required fields.
- If you see "End date must not be before the start date." swap or correct the dates.
- If you see "A closure plan cannot span more than one year." split the closure into two plans.
- If you see "Set both closure times, or leave both empty for a whole-day closure." one of the two time boxes is filled and the other is empty; the day editor reports the same with the date in front.
- If you see "Closure end time must be after the start time." the window ends before it starts.
- If you see "No days in the period match the plan's day scope." the period holds, for example, only weekdays while the scope is Weekends; widen the period or change the scope.
- If you see "Closure date X appears more than once." the day list holds a duplicate; remove one row.
- If you see "Every selected unit course must belong to the active company." or "Select a workspace first." check the company selected at the top of the screen.
- A closure takes effect only through saved closure days on an active plan: a plan with 0 days, or a disabled plan, blocks nothing.
- Bookings made before a closure was saved are not cancelled by it; the front desk sees a closure warning when such a booking is registered, and walk-ins at a closed time are refused.
- For a closure that already has bookings on it, use the Golf Booking screen to cancel them and inform the players.

## Related options

- Golf Management → Unit Courses - the nines this screen closes.
- Golf Management → Courses - the 18-hole courses whose tee-offs and crossovers are blocked when a nine is closed.
- Golf Management → Golf Booking - closed times are not offered when searching flights.
- Golf Management → Front Desk → Tee Time Sheet - shows closed times as CLOSED and warns when registering a booking that falls on a closure.
- System Setup → Companies → Weekend days and System Setup → Public Holidays - decide which dates count as weekdays and weekends.
