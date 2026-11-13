# Venues

> **Where:** Facility Management → Venues
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New venue button needs the Create permission for this screen; Edit and the ⋮ menu (Enable/Disable) need the Edit permission; Delete needs the Delete permission as well.
> A venue that your role's data scope does not let you amend shows no Edit and no ⋮ menu.

## What this option is for

A venue is where a class is held - a court, two lanes of the pool, a studio or a meeting room.
Classes and their sessions are held at venues, so set up the venues here before creating classes and their schedules.
A venue can be linked to one facility, and that link decides what happens to bookings while a class session runs.
A venue on a court or hall that is booked by time slot blocks the whole facility on the booking grid during the session.
A venue on the gym or the pool takes only part of the space and blocks nothing, and a venue that is not a facility at all (a studio, a meeting room) stays unlinked and blocks nothing.

## The screen at a glance

[Screenshot: Venues list]

- A count line shows how many venues exist and how many are active.
- A search box filters the list as you type; it matches the venue's code, name and location, and the code of the linked facility.
  When nothing matches, a **Clear search** button brings the full list back.
- Each venue is a card: the title as code and name (e.g. `LANES12 - Pool lanes 1-2`), then a chip with the linked facility's code and its facility type code, or **Not a facility** for an unlinked venue.
  A **Blocks the court** chip shows when sessions at the venue block the linked facility on the booking grid.
  The same line shows the number of seats and the location, and the description sits on a line below.
- **Classes** and **Sessions** show how many classes and class sessions name the venue.
- A status chip at the top right shows **Active** or **Disabled**; active venues are listed first, in code order.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**, and **Delete**.
- The **New venue** button floats at the bottom right of the screen.
- Two labels in the dialog carry a small information icon; hover over it or click it to read a longer explanation of the field.

## Common tasks

### Add a new venue

[Screenshot: New venue dialog]

1. Click **New venue**.
2. Enter the **Code** (e.g. `LANES12`) and the **Name** (e.g. `Pool lanes 1-2`).
3. Enter the **Capacity (seats)** - the default number of seats a session holds here.
4. Under **Facility unit**, pick the facility the venue occupies, or leave it on **Not a facility** for a studio or a meeting room.
   Type a few letters of the code or name to search the list.
5. Read the line under the picker: it states whether sessions here will block that facility on the booking grid.
6. Optionally enter the **Location**, a **Description** and **Remarks**.
7. Click **Save**.

The venue appears in the list and can now be picked for classes and class sessions.

### Edit a venue

1. Find the venue (use the search box if the list is long) and click **Edit**.
2. Change what you need.
   Once a class session references the venue, its **Code** and its **Facility unit** are frozen and shown greyed out; the note under the code tells you how many sessions reference it.
3. Click **Save**.

To change the facility of a venue that is already in use, disable the venue and create another one.
If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a venue

- Open the card's ⋮ menu and click **Disable** to retire a venue you no longer use.
  A disabled venue keeps its past sessions and cannot be picked for new classes or sessions.
- Open the ⋮ menu and click **Enable** to bring it back.

### Delete a venue

1. Open the card's ⋮ menu and click **Delete**.
2. Read the confirmation: it names the venue, or tells you how many classes and sessions still name it.
3. Click **Delete venue**.

A venue cannot be deleted while a class, a class schedule or a session names it; the system refuses, so disable it instead to keep it out of use.
Deleting cannot be undone.

## Field reference

### New / Edit venue dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code for the venue, e.g. `LANES12` or `STUDIO`. | Up to 20 characters; letters, digits, underscores and hyphens only; stored in capitals; must be unique in the company; frozen once a session references the venue. |
| **Capacity (seats)** | Yes | The default seats a session holds here. A class, a schedule or a session may lower it, never raise it. | A whole number from 1 to 500; default 10. |
| **Name** | Yes | The name staff see, e.g. `Pool lanes 1-2`, `Studio A` or `Badminton Court 3`. | Up to 255 characters. |
| **Facility unit** | No | The facility the venue occupies. On a court or hall booked by slot, the whole facility is blocked on the booking grid while a session runs, and a class schedule skips that facility's closure days. On the gym or pool, the session takes part of the space and nothing is blocked. A studio or meeting room that is not a facility stays on **Not a facility**. | Only active facilities of active facility types are offered; several venues may share one facility (lanes 1-2 and lanes 3-4); frozen once a session references the venue. |
| **Location** | No | Where to find the venue, e.g. `Level 2, past the gym`. Shown on the card. | Up to 255 characters. |
| **Description** | No | A short description of the venue. Shown under the card's title line. | Up to 255 characters. |
| **Remarks** | No | Any note about the venue. | Up to 255 characters. |

## Tips & troubleshooting

Codes and counts in the messages below are examples; yours show your own values.

- If you see "Venue 'LANES12' already exists." the code is already used by another venue in this company; choose a different code.
- If you see "Code is required: 1-20 characters, letters, digits, underscores and hyphens only." correct the code; spaces are not accepted.
- If you see "Code, name and capacity are required." fill in those three fields.
- If you see "Capacity must be a whole number between 1 and 500." correct the number of seats.
- If you see "Pick a facility of the active company, or leave the venue unlinked." pick the facility again; the one chosen no longer exists in this company.
- If you see "The code is frozen - 4 sessions already reference LANES12." the code can no longer be changed.
- If you see "The facility link is frozen - 4 sessions already reference LANES12. Retire this venue and create another." disable this venue and add a new one linked to the right facility.
- If you see "Cannot delete LANES12 - 1 class, 1 schedule and 4 sessions still name it. Disable it to keep it out of use." disable the venue instead.
- If you see "Your role's data scope does not allow amending this record." the venue was created by someone outside your data scope; ask its owner or an administrator to change it.
- If you see "Select a workspace first." pick your company at the top of the screen.
- The line under **Facility unit** always states the consequence of your choice: "Blocks the whole of BC1 on the booking grid while a session runs.", "Takes part of POOL - nothing is blocked, the door count stays its own." or "Not a facility - nothing is blocked while a session runs."
- If a facility is missing from the **Facility unit** list, the facility or its facility type is disabled; enable it on the Facilities or Facility Types screen.
- An unlinked venue has no closures of its own; when a studio is unavailable, cancel the class session instead.
- A closure saved on the linked facility cancels the scheduled class sessions held at the venue during the closed times (see the Facility Closures guide).

## Related options

- Facility Management → Classes - a class names its usual venue, or leaves the venue to be chosen per schedule.
- Facility Management → Class Schedule - the sessions held at each venue.
- Facility Management → Instructors - the people who lead the classes.
- Facility Management → Facilities - the courts, halls, gym and pool a venue can be linked to.
- Facility Management → Facility Closures - closures of the linked facility.
- Facility Management → Facility Bookings - where a session at a venue on a time-slot facility blocks the booking grid.
