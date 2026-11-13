# Classes

> **Where:** Facility Management → Classes
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New class button needs the Create permission for this screen; Edit, Schedules (adding, editing, closing and cancelling a schedule) and Enable/Disable need the Edit permission; Delete also needs the Delete permission.

## What this option is for

The Classes screen holds the instructor-led classes the club offers - yoga, aqua aerobics, coaching, swimming lessons - and the schedules each class runs on.
A class records its default venue and instructor, the seats per session, how people enrol (per session or per term), the fee items for members and visitors, and whether visitors and walk-ins are accepted.
Each schedule runs the class on chosen weekdays between two dates at one time, and generates the dated sessions that appear on the Class Schedule timetable.
Staff come here to set up a new class, to plan a new term or run of sessions, to change a schedule, or to close or cancel one.
Set up the venues, the instructors and the Class Fee transaction types first, because a class picks from them.

## The screen at a glance

[Screenshot: Classes list]

- A count line shows how many classes exist and how many are active.
- Three buttons filter the list by enrolment mode: **All modes**, **Per session** and **Per term**.
- A search box filters the list as you type; it matches the code, the description, the venue code and the instructor's name.
- Each class is a card titled with its code and description.
  Below the title: the enrolment mode, the default venue, the default instructor, the seats per session, and a **Visitors** chip when visitors may enrol.
- The card's figures: **Fee** (the fee item per session or per term, with the visitor item where there is one, or "Free"), **Schedules** (how many schedules the class has) and **Upcoming** (how many of its sessions are still scheduled).
- A status chip shows **Active** or **Disabled**; active classes are listed first, then by sort order.
- Each card has an **Edit** button and a ⋮ menu holding **Schedules (n)**, **Enable** or **Disable**, and **Delete**.
  A card you may not amend under your role's data scope shows no actions.
- The **New class** button sits at the bottom right.
- When a filter or the search matches nothing, **Clear filters** brings the whole list back.

## Common tasks

### Add a new class

[Screenshot: New class dialog]

1. Click **New class**.
2. Under **Identity**, enter the **Code** (e.g. `YOGA_AM`), the **Description** (e.g. `Morning Yoga`), the **Sort Order** and optionally the **Details** - what the class is and what to bring.
3. Under **Where and who**, pick the **Default venue** and the **Default instructor**, or leave them as **Chosen per schedule**.
   Enter the **Seats per session**, or leave it blank to take the venue's capacity.
4. Under **Enrolment and fees**, pick the **Enrolment mode**:
   - **Per session** - a person takes a seat in one session and the fee item is priced per session.
   - **Per term** - a person takes a seat in every session of a schedule and the fee item is priced per term.
5. Optionally enter the **Cancellation notice (hours)**; blank follows the class notice on Facility Specification.
6. Pick the **Fee item (members)**, or leave it as **Free class**.
7. Turn on **Visitors may enrol** if non-members may join; a **Fee item (visitors)** box then appears - leave it as **Same as members** unless visitors pay a different fee.
8. Keep **Walk-ins at the Control Station on the day** ticked if the station may enrol people into a session on the day.
9. Click **Save**.

The class appears in the list.
Next add its schedules from the card's ⋮ menu - a class has no sessions until a schedule generates them.

### Add a schedule and generate its sessions

[Screenshot: New schedule view]

1. Open the card's ⋮ menu and click **Schedules (n)**.
2. Click **Add schedule**.
3. Enter the **Name** (e.g. `Term 1 2027`), the **First day** and the **Last day** (up to one year apart).
4. Under **Runs on**, tick the weekdays the class runs on.
5. Enter the **Starts** and **Ends** times.
6. Check the **Venue** and the **Instructor** (they start from the class defaults) and optionally the **Seats per session**.
7. For a per-term class, optionally enter a **Term note** (e.g. `10 sessions`).
8. Leave **Skip days the venue's facility is closed** and **Skip public holidays** ticked unless the class should run on those days.
9. Click **Preview sessions**, or **Back to list** to return to the schedules without saving.

[Screenshot: Sessions preview]

10. Read the preview.
    The first line tells you how many sessions will be generated, how many dates are skipped and how many are in conflict and left out.
    Every date in the range is listed with a chip: **Session** (it will be generated), **Skipped** (a public holiday, or the venue's facility is closed) or **Conflict** (the venue, the court or the instructor is already taken at that time, or the court is booked), with the reason beside it.
    When the venue is linked to a facility that is booked by time slot, the preview also says that each session blocks the court on the booking grid.
11. Click **Save with n sessions**, or **Back** to change the schedule first.

Nothing is saved before you click **Save with n sessions**.
Only the dates marked **Session** are generated; skipped and conflicting dates are left out.
The button stays disabled when no session can be generated.

### Edit a schedule (re-plan its sessions)

1. Open **Schedules (n)** and click **Edit** on the schedule.
2. Change the dates, the weekdays, the times, the venue, the instructor or the seats.
3. Click **Preview sessions**, check the dates, then click **Save and re-plan**.

Saving re-plans the future sessions of the schedule.
Sessions still on the pattern take the new times, venue, instructor and seats; sessions no longer on the pattern are cancelled with the reason "Schedule changed"; new dates are added.
A future session of the schedule that was cancelled earlier and falls on the pattern is scheduled again.
Past and held sessions stay as they are.
If a session cancelled this way had seats, they are released as when a session is cancelled, and the confirmation message tells you how many seats were released and how many bills were voided or left for Finance.
A cancelled schedule cannot be edited.

### Close a schedule to new enrolments

1. Open **Schedules (n)**.
2. Open the schedule's ⋮ menu and click **Close to new enrolments**.

The schedule turns **Closed** at once: its sessions still run, but nobody new can enrol.
The action is offered on an **Active** schedule only.

### Cancel a schedule

[Screenshot: Cancel schedule view]

1. Open **Schedules (n)**.
2. Open the schedule's ⋮ menu and click **Cancel schedule**.
3. Read the summary - the schedule's name, its dates and how many sessions are still scheduled.
4. Enter the **Reason**.
5. Click **Cancel schedule**, or **Keep schedule** to go back without cancelling.

Every future scheduled session is cancelled with this reason; past and held sessions stay.
The seats of those sessions are released, a term's enrolments and its waitlist end with the schedule, and the confirmation message tells you how many sessions were cancelled, seats released and bills voided or left for Finance.
A cancelled schedule stays in the list with a **Cancelled** chip and no further actions.

### Edit a class

1. Find the class (use the filters or the search box if the list is long) and click **Edit**.
2. Change what you need.
   The **Enrolment mode** is frozen once the class has a schedule.
3. Click **Save**.

If you leave without saving, the system asks whether to discard your changes or keep editing.

### Disable / enable a class

- Open the ⋮ menu and click **Disable** to keep a class out of use.
  A disabled class takes no new schedule, no one-off session and no new enrolment; its history is kept.
- Click **Enable** to bring it back.

### Delete a class

1. Open the ⋮ menu and click **Delete**.
2. Read the confirmation and click **Delete class**.

Only a class with no schedule and no session can be deleted, and it cannot be undone.
Disable a class that has run before.

## Field reference

### New / Edit class dialog - Identity

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code for the class, e.g. `YOGA_AM`. | Up to 30 characters; letters, digits, underscores and hyphens only; stored in capitals; must be unique within the company. |
| **Sort Order** | Yes | The class's position in the list; lower numbers come first. | A whole number from 0 to 9999; starts at 100. |
| **Description** | Yes | The class's name as staff and members read it, e.g. `Morning Yoga`. | Up to 255 characters. |
| **Details** | No | What the class is and what to bring; shown on the roster and in the enrolment email. | Up to 4000 characters. |

### New / Edit class dialog - Where and who

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Default venue** | No | Where the class normally takes place; a schedule or a single session may pick another. | Type to search; only active venues are listed; Chosen per schedule = no default. |
| **Default instructor** | No | Who normally leads the class; a schedule or a single session may pick another. | Type to search; only active instructors are listed; Chosen per schedule = no default. |
| **Seats per session** | No | How many people one session takes. | A whole number from 1 to 500; blank = the venue's capacity; never more than the venue's capacity. |

### New / Edit class dialog - Enrolment and fees

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Enrolment mode** | Yes | Per session (a seat in one session) or Per term (a seat in every session of a schedule). | Frozen once the class has a schedule. |
| **Cancellation notice (hours)** | No | A seat cancelled closer than this to the session keeps its fee. | A whole number from 0 to 720; blank = the class notice on Facility Specification; 0 = no notice rule for this class. |
| **Fee item (members)** | No | The Class Fee transaction type charged for a seat, priced per session or per term by the enrolment mode. | Type to search; only active Class Fee items are listed; Free class = nothing is charged. |
| **Fee item (visitors)** | No | A different Class Fee item when visitors pay more than members. | Shown only while Visitors may enrol is on; Same as members = the member item applies. |
| **Visitors may enrol** | No | On = non-members may take a seat, enrolled with a visitor profile. | Off by default; turning it off clears the visitor fee item. |
| **Walk-ins at the Control Station on the day** | No | Ticked = the Control Station may enrol a person into a session on the day, within the capacity. | Ticked by default. |

### New / Edit schedule

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Name** | Yes | What the run is called, e.g. `Term 1 2027` or `Weekday mornings`. | Up to 255 characters. |
| **First day** | Yes | The first date of the run; pick it from the calendar. | Not after the Last day. |
| **Last day** | Yes | The last date of the run. | Not before the First day; a schedule cannot span more than one year. |
| **Runs on** | At least one | Tick the weekdays the class runs on, Monday to Sunday. | The system refuses a schedule with no weekday ticked; a new schedule starts with Monday and Wednesday ticked. |
| **Starts** | Yes | The time every session starts. | Before the Ends time. |
| **Ends** | Yes | The time every session ends. | After the Starts time. |
| **Venue** | No | The venue of this schedule's sessions. | Starts from the class default; Class default = follow the class; a venue is needed either here or on the class. |
| **Instructor** | No | The instructor of this schedule's sessions. | Starts from the class default; Class default = follow the class; an instructor is needed either here or on the class. |
| **Seats per session** | No | The seats of this schedule's sessions. | A whole number from 1 to 500; blank = the class default; never more than the venue's capacity. |
| **Term note** | No | A short note shown with a term enrolment, e.g. `10 sessions`. | Up to 255 characters; shown for per-term classes only. |
| **Skip days the venue's facility is closed** | No | Ticked = dates on which the venue's facility is closed are skipped. | Ticked by default. |
| **Skip public holidays** | No | Ticked = public holidays are skipped; unticked = they are kept and marked "Public holiday, kept" in the preview. | Ticked by default. |
| **Remarks** | No | Anything the office should know about this schedule. | Up to 255 characters. |

### Cancel schedule

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes | Why the schedule is cancelled; it is recorded on every session cancelled with it. | Up to 255 characters. |

## Tips & troubleshooting

- If you see "Class 'YOGA_AM' already exists." the code is taken; edit that class instead or pick another code.
- If you see "The enrolment mode is frozen - YOGA_AM already has 2 schedules." create a new class for the other enrolment mode.
- If you see "Capacity 30 exceeds the venue's 20 (STUDIO1)." lower the seats or pick a larger venue.
- If you see "Venue STUDIO1 is disabled." or "Instructor COACH1 is disabled." pick an active venue or instructor.
- If you see "Fee item: 'YOGAFEE' is not a Class Fee." or "Fee item: 'YOGAFEE' is disabled." pick an active item whose charge type is Class Fee on Transaction Types.
- If you see "Cannot delete YOGA_AM - 1 schedule and 10 sessions belong to it. Disable the class to keep it out of use." the class has history; disable it instead.
- If you see "Tick at least one weekday the class runs on.", "The last day must not be before the first day." or "The end time must be after the start time." correct the schedule and preview again.
- If you see "A schedule cannot span more than one year." shorten the date range and add a second schedule for the rest.
- If you see "Pick a venue - the class has no default venue." or "Pick an instructor - the class has no default instructor." pick one on the schedule, or set the default on the class.
- If you see "Capacity 30 exceeds the venue's 20." lower the schedule's seats.
- If you see "No session can be generated - 3 dates skipped, 2 in conflict. Change the dates or the times." every date in the range was skipped or in conflict.
- If the preview shows "No date in the range falls on the ticked weekdays." widen the dates or tick other weekdays.
- If you see "YOGA_AM is disabled - enable it before adding a schedule." enable the class first; the Add schedule button is also hidden for a disabled class.
- If you see "A cancelled schedule cannot be edited.", "The schedule is already closed." or "The schedule is already cancelled." the schedule has already reached that state.
- If you see "Your role's data scope does not allow amending this record." the class belongs to someone outside your data scope; ask an administrator.
- A conflict reason names what is in the way, e.g. "Venue taken by YOGA_AM 09:00-10:00", "Court taken by ...", "Booked - ..." (a booking number) or "Instructor on ...".
- Always read the preview before saving: it is the exact list of sessions the schedule will create.

## Related options

- Facility Management → Class Schedule - the weekly timetable of the sessions generated here: the roster, enrolment, attendance, moving or cancelling one session, and one-off sessions.
- Facility Management → Instructors - the instructors offered as defaults and on schedules.
- Facility Management → Venues - the venues offered here, with their capacity.
- Facility Management → Transaction Types - the Class Fee items and their prices.
- Facility Management → Facility Specification - the Classes switch, the class cancellation notice and the waitlist offer hours.
- Facility Management → Facility Closures - the closure days a schedule skips.
- Facility Management → Control Station - walk-in enrolment on the day, when the class allows it.
- System Setup → Public Holidays - the holidays a schedule skips.
