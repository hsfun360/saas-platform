# Instructors

> **Where:** Facility Management → Instructors
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New instructor button needs the Create permission for this screen; Edit and Enable/Disable need the Edit permission; Delete also needs the Delete permission.

## What this option is for

The Instructors screen is the club's list of the people who lead its classes - coaches, trainers and teachers.
Each instructor has a code, a name, contact details, specialities and an optional photo.
Every class session has an instructor, so set the instructors up before creating classes and their schedules.
An instructor recorded here is picked as the default instructor of a class, on a schedule, or on a single session.
Instructors have no login of their own; this screen only records who they are and how to reach them.

## The screen at a glance

[Screenshot: Instructors list]

- A count line shows how many instructors exist and how many are active.
- A search box filters the list as you type; it matches the code, the name and the specialities.
  When nothing matches, **Clear search** brings the whole list back.
- Each instructor is a card with the photo (or a person symbol when there is none), the name and code as the title, then the specialities, the email and the mobile number where recorded.
- The card's figures: **Classes** (how many classes name this instructor as their default) and **Sessions** (how many class sessions name this instructor).
- A status chip shows **Active** or **Disabled**; active instructors are listed first, then by name.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**, and **Delete**.
  A card you may not amend under your role's data scope shows no actions.
- The **New instructor** button sits at the bottom right.

## Common tasks

### Add a new instructor

[Screenshot: New instructor dialog]

1. Click **New instructor**.
2. Enter the **Code** (e.g. `COACH1`) and the **Name**.
3. Optionally enter the **Mobile** number - pick the country code, then type the number.
4. Optionally enter the **Email**; the instructor then receives the session cancellation and roster emails.
5. Optionally enter the **Specialities** (e.g. `Yoga, Pilates`) and any **Remarks**.
6. Optionally click **Upload photo** and pick an image.
7. Click **Save**.

The instructor appears in the list and can be picked on Classes and on the Class Schedule.

### Edit an instructor

1. Find the instructor (use the search box if the list is long) and click **Edit**.
2. Change what you need.
   The **Code** is frozen once a session references the instructor; the dialog tells you how many sessions do.
   Use **Replace photo** or **Remove** to change the photo.
3. Click **Save**.

If you leave without saving, the system asks whether to discard your changes or keep editing.

### Disable / enable an instructor

- Open the ⋮ menu and click **Disable** when an instructor no longer teaches at the club.
  A disabled instructor keeps past sessions and can no longer be picked for new classes, schedules or sessions.
- Click **Enable** to bring the instructor back.

### Delete an instructor

1. Open the ⋮ menu and click **Delete**.
2. Read the confirmation and click **Delete instructor**.

Only an instructor that no class and no session names can be deleted, and it cannot be undone.
When the instructor is in use, the confirmation tells you how many classes and sessions name them; disable the instructor instead.

## Field reference

### New / Edit instructor dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code for the instructor, e.g. `COACH1`. | Up to 20 characters; letters, digits, underscores and hyphens only; stored in capitals; must be unique within the company; frozen once a session references the instructor. |
| **Name** | Yes | The instructor's name as shown on the timetable and the roster, e.g. `Mei Ling`. | Up to 255 characters. |
| **Mobile** | No | The instructor's mobile number; pick the country code, then type the number. | Optional. |
| **Email** | No | The address that receives the session cancellation and roster emails. | Must be a valid email address; up to 255 characters; saved in lower case. |
| **Specialities** | No | What the instructor teaches, e.g. `Yoga, Pilates`; shown on the card and matched by the search. | Up to 255 characters. |
| **Photo** | No | A picture of the instructor; click Upload photo, then Replace photo or Remove later. | An image file up to 2 MB. |
| **Remarks** | No | Anything the office should know about this instructor. | Up to 255 characters. |

## Tips & troubleshooting

- If you see "Instructor 'COACH1' already exists." the code is taken; edit that instructor instead or pick another code.
- If you see "The code is frozen - 12 sessions already reference COACH1." the instructor is already on the timetable; keep the code and change the name instead.
- If you see "Cannot delete COACH1 - 1 class and 12 sessions still name Mei Ling. Disable the instructor instead." the instructor is in use; disable them to keep the history.
- If you see "Enter a valid email address, or leave it blank." correct the email or clear the box.
- If you see "Your role's data scope does not allow amending this record." the record belongs to someone outside your data scope; ask an administrator.
- Record an email for every instructor who should be told when a session is cancelled.
- Disable rather than delete an instructor who has taught before: the past sessions keep their instructor.

## Related options

- Facility Management → Classes - names an instructor as a class's default and on each schedule.
- Facility Management → Class Schedule - shows each session's instructor and lets you swap the instructor of one session.
