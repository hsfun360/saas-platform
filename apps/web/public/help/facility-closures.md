# Facility Closures

> **Where:** Facility Management → Facility Closures
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New closure plan button needs the Create permission for this screen; Closure days and the ⋮ menu (Edit, Enable/Disable) need the Edit permission; Delete needs the Delete permission as well.
> A closure plan that your role's data scope does not let you amend has no ⋮ menu; its Closure days still open, view only.

## What this option is for

The Facility Closures screen records the periods when a facility is not available - court resurfacing on weekday mornings, the pool closed for a swim meet, a hall taken for an event.
A closure can cover one facility or every facility of a facility type.
A **closure plan** is the rule: what closes, a description, which days of the week, the date period and the daily closed window.
From the plan you **generate** the individual **closure days**, review them, except single days or adjust their times, and save; only the saved closure days actually close anything.
While a closure day is in force, the closed slots cannot be booked on the Facility Bookings screen and the Control Station refuses entry to the closed facility.
This screen is separate from the Facility Types and Facilities setup screens, so maintenance schedulers can be given closures without the setup screens.

## The screen at a glance

[Screenshot: Facility Closures list]

- A count line shows how many closure plans exist and how many are active.
- A search box filters the list as you type; it matches the description, the code and description of the facility type, the code and name of the facility, and the period dates (typed as year-month-day, e.g. `2026-11`).
  When nothing matches, a **Clear search** button brings the full list back.
- Each plan is a card: the description as the title, then what it closes - the facility's code and name, or the type's code with "Every ... facility" for a whole type - followed by **Period**, **Days** (All days / Weekdays / Weekends), **Closed** (the daily window, or "All day") and **Closure days** (how many days are saved).
- A status chip at the top right shows **Active** or **Disabled**; active plans are listed first, newest period first.
- Each card has a **Closure days (n)** button and a ⋮ menu holding **Edit**, **Enable** or **Disable**, and **Delete**.
- The **New closure plan** button floats at the bottom right of the screen once at least one active facility type exists.

## Common tasks

### Close a facility, or a whole type, over a period

[Screenshot: New closure plan dialog]

1. Click **New closure plan**.
2. Pick the **Facility type** that closes.
3. Under **Facilities**, tick the facility or facilities to close.
   Leave every box unticked to close every facility of the type with ONE plan.
   When you tick several, one plan is created per ticked facility and each plan's days are generated separately.
4. Enter the **Description** (e.g. `Court resurfacing`).
5. Pick the **Day scope**: **All days**, **Weekdays** or **Weekends** (public holidays count as weekends).
6. Set the **Start date** and **End date** of the period.
7. To close only part of each day, set **Closed from** and **Closed until**; leave both empty to close for the whole day.
8. Click **Save** (the button reads **Save on n facilities** when two or more facilities are ticked).

The plan appears in the list with **0** closure days.
Nothing is closed yet: generate and save the closure days next.

You can also start from the Facilities screen: the **Closures** entry in a facility's ⋮ menu opens this dialog with the type picked and that facility already ticked.

### Generate and save the closure days

[Screenshot: Closure days dialog]

1. Click **Closure days (n)** on the plan's card.
2. Click **Generate days (...)** - the button names the day scope and the period it will expand.
   The system lists every date in the period that matches the day scope, each tagged **Weekend** or **Holiday** where that applies, filled with the plan's closed window.
3. If scheduled class sessions are held on the closed facility at those times, a note lists them and states that saving will cancel them.
   Read it before you go on.
4. Review the rows:
   - change a day's **From** / **Until** times (or clear both for a whole-day closure on that date);
   - untick **On** to keep a date in the list but not apply the closure that day;
   - click ✕ to remove a date altogether.
5. Click **Save n days**.

The saved days now close the facility at those times.
If you later change the plan's period, day scope or times, the saved days are not changed automatically - open **Closure days**, click **Regenerate days (...)** to rebuild them, then save.

### Edit a closure plan

1. Open the card's ⋮ menu and click **Edit**.
2. Change the description, the day scope, the period or the closed window.
   What the plan closes is shown under **Closes** but cannot be changed; to close something else, create a new plan and disable or delete this one.
3. Click **Save**.

If you leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a closure plan

- Open the card's ⋮ menu and click **Disable** to lift the closure without deleting it.
  A disabled plan's days no longer close anything; the plan stays on this screen for history.
- Open the ⋮ menu and click **Enable** to put it back in force.

### Delete a closure plan

1. Open the card's ⋮ menu and click **Delete**.
2. Read the confirmation: it names the plan, what it closes and how many closure days go with it.
3. Click **Delete closure plan**.

The plan and its closure days are removed and the slots reopen for booking.
This cannot be undone.

## Field reference

### New / Edit closure plan dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Facility type** | Yes (new plans) | The facility type that closes, e.g. `BADMINTON - Badminton`. | Only active facility types are offered. On an existing plan this and the facilities show as the read-only **Closes** box. |
| **Facilities** | No | Tick the facility or facilities of that type to close; each ticked facility gets its own plan with the same details. | Only active facilities are offered. None ticked = one plan closes every facility of the type. Shown once a type is picked, on new plans only. |
| **Description** | Yes | What the closure is for, e.g. `Court resurfacing` or `Swim meet`. Shown on the card and in the title of the Closure days dialog. | Up to 255 characters. |
| **Day scope** | Yes | Which days of the period the closure applies to: **All days**, **Weekdays** or **Weekends**. | Public holidays count as weekends. |
| **Start date** | Yes | The first date of the period, picked from the calendar. | Must not be after the end date. |
| **End date** | Yes | The last date of the period, picked from the calendar. | A plan cannot span more than one year. |
| **Closed from** | No | The time of day the closure starts, e.g. `07:00`. | Set both times or neither; leave both empty for a whole-day closure. |
| **Closed until** | No | The time of day the closure ends, e.g. `12:00`. | Must be after **Closed from**. |

### Closure days dialog (one row per date)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Date** | - | Shown, not entered: the closure date, with a **Weekend** or **Holiday** tag on freshly generated rows where that applies. | Each date may appear only once. |
| **From** / **Until** | No | The closed window on that date; filled from the plan when the days are generated. | Set both or neither (whole day); Until must be after From. |
| **On** | No | Tick to apply the closure on that date; untick to except the date while keeping it in the list. | Generated rows start ticked. |
| ✕ | - | Removes the date from the list. | Regenerating brings it back. |

## Tips & troubleshooting

Codes, counts and dates in the messages below are examples; yours show your own values.

- If you see "Facility type, description, day scope and the date period are required." fill in the required fields.
- If you see "End date must not be before the start date." swap or correct the dates.
- If you see "A closure plan cannot span more than one year." split the closure into two plans.
- If you see "Set both closure times, or leave both empty for a whole-day closure." one of the two time boxes is filled and the other is empty; the Closure days dialog reports the same with the date in front.
- If you see "Closure end time must be after the start time." the window ends before it starts; the Closure days dialog reports the same with the date in front.
- If you see "No days in the period match the plan's day scope." the period holds, for example, only weekdays while the scope is Weekends; widen the period or change the scope.
- If you see "Closure date 2026-11-20 appears more than once." the day list holds a duplicate; remove one row.
- If you see "Every selected facility must belong to BADMINTON." a ticked facility is not of the chosen type; pick the type again and tick the facilities afresh.
- If you see "Pick a facility type of the active company." pick the facility type again; the one chosen no longer exists in this company.
- If you see "This type has no active facilities yet - the plan closes the whole type." under **Facilities**, the plan can only be made for the whole type; add or enable facilities on the Facilities screen if you meant to close just one.
- If you see "Your role's data scope does not allow amending this record." the plan was created by someone outside your data scope; ask its owner or an administrator to change it.
- If you see "View only - your role's data scope does not allow amending this closure plan." you can look at the closure days but not change them.
- If you see "Select a workspace first." pick your company at the top of the screen.
- A closure takes effect only through saved closure days on an active plan: a plan with 0 days, or a disabled plan, closes nothing.
- Saving closure days on an active plan cancels the scheduled class sessions whose venue is linked to the closed facility and that fall inside the closed times: every seat is released, open bills are voided, settled ones are listed for Finance, and the patrons and the instructor are emailed.
  The save message then ends with the number of class sessions cancelled.
- While a closure is in force, staff who try to book or register there see messages such as "BC1 is closed at 07:00." on Facility Bookings and "BC1 is closed right now." at the Control Station.
- Bookings made before a closure was saved are not cancelled or moved by it; check the Facility Bookings screen for that facility and those dates, and cancel or rebook them yourself.
- A closure on one facility of an entry type does not close the others: the Control Station refuses entry to the closed facility, and to the type as a whole only when every one of its facilities is closed at that moment.

## Related options

- Facility Management → Facilities - the facilities this screen closes; a facility's ⋮ menu has a **Closures** shortcut to this screen.
- Facility Management → Facility Types - the types whose facilities close together when no single facility is ticked.
- Facility Management → Facility Bookings - closed slots are marked closed on the booking grid and cannot be booked.
- Facility Management → Control Station - refuses entry to a closed facility.
- Facility Management → Class Schedule - class sessions on a closed facility are cancelled when closure days are saved.
- System Setup → Companies → Weekend days and System Setup → Public Holidays - decide which dates count as weekdays and weekends.
