# Unit Courses

> **Where:** Golf Management → Master File Setup → Unit Courses
>
> **Who can use it:** users whose role includes the Golf Management module.
> The **New unit course** button needs the Create permission; **Edit**, **Holes**, **Tees** and **Enable/Disable** need the Edit permission; **Delete** needs the Delete permission.

## What this option is for

The Unit Courses screen maintains your club's nine-hole course sections - the building blocks of golf setup.
Each unit course is one "nine" with its own holes (par and handicap index) and tee boxes (colours and per-hole distances).
A full 18-hole course is formed later, on the Courses screen, by pairing two unit courses: one as the OUT (front) nine and one as the IN (back) nine; a COMPOSITE nine can sit in either seat.
Staff come here first when setting up golf: define every nine the club has, enter its holes and tee boxes, and then go to Courses to pair them.

## The screen at a glance

[Screenshot: Unit Courses list]

- A count line reads "N unit courses, M active".
- A search box filters the list as you type; it matches the code, the description and the type (OUT / IN / COMPOSITE).
  When nothing matches, the screen says so and offers **Clear search**.
- Each unit course is a card: the code with a type tag (hover it to read what the type means); the description and remarks underneath; then **Completion** in minutes and **Floodlight** (Yes with "fee from N min before dark", or No).
- A status chip top-right shows **Active** or **Disabled**; active nines are listed first.
  A disabled nine stays on this screen but is not offered when setting up courses.
- Each card has one visible **Edit** button and a ⋮ menu holding **Holes**, **Tees**, **Enable** or **Disable**, and **Delete**.
- With no nines yet, the screen explains that a unit course is one nine and that two (OUT + IN) are paired into an 18-hole course afterwards.
- The **New unit course** button floats at the bottom right.

## Common tasks

### Add a new unit course

[Screenshot: New unit course drawer]

1. Click **New unit course**.
2. Enter the **Unit course code** (e.g. `OZ`) and pick the **Type**:
   - **OUT** - a front nine only (its holes are numbered 1-9).
   - **IN** - a back nine only (holes 10-18).
   - **COMPOSITE** - a nine that can play as either the front or the back (holes 1-18 are listed so it carries both contexts).
   A line under the Type field restates what the chosen type means.
3. Optionally set the **Number** (display order), the **Completion time (minutes)** and a **Description**.
4. If the nine has lighting equipment for night golf, tick **Floodlit (night golf)**; the **Lighting fee starts (minutes before dark)** field then appears.
5. Add **Remarks** if useful and click **Save**.

The message "OZ added." confirms it; the new nine appears in the list as Active and the list scrolls back to it.
Enter its holes and tee boxes next (below) before pairing it into an 18-hole course.

### Set up the holes (par and handicap index)

[Screenshot: Holes drawer]

1. Open the card's ⋮ menu and click **Holes**.
   The drawer is titled **Holes - <code>** and a hint line names the type and the hole range.
2. Every hole of the nine is listed; the hole numbers are fixed by the type (OUT shows 1-9, IN shows 10-18, COMPOSITE shows 1-18) and cannot be changed.
3. For each hole pick the **Par** (3, 4 or 5; holes never saved before start at par 4) and the **HCP** (handicap index), and add **Remarks** if needed.
4. Watch the **Total par** line at the bottom - a standard nine totals 35-36.
5. Click **Save N holes**.

About the HCP choices: front-nine holes (1-9) offer only ODD indexes (1-17) and back-nine holes (10-18) only EVEN indexes (2-18).
That way, when an OUT and an IN nine are paired into an 18-hole course, the course gets a complete handicap set of 1-18 with no clashes.

### Set up the tee boxes (colours and distances)

[Screenshot: Tee boxes drawer]

1. Open the card's ⋮ menu and click **Tees**.
   The drawer is titled **Tee boxes - <code>**; with no tee boxes yet it invites you to add them (e.g. BLUE, WHITE, RED).
2. Click **Add tee box** for each tee the nine has.
3. For each tee box enter the **Colour code**, pick the swatch **Colour**, optionally set the **Number** (display order 1-5), the **Measurement** unit (Meter or Yard) and a **Description**.
4. Fill in the **Distance per hole** row like a scorecard - one cell per hole; the OUT / IN subtotal is calculated as you type, and a COMPOSITE nine (two rows of nine) also shows the grand **Total**.
5. To drop a tee box, click the red ✕ at the end of its header row (an icon-only button; nothing is removed until you save).
6. Click **Save N tee boxes**.

Difficulty ratings (course and slope rating) are not entered here; they belong to the rated 18-hole course and are set up on the Courses screen.

### Edit a unit course

1. Find the unit course (use the search box if the list is long) and click **Edit**.
2. Change what you need; unticking **Floodlit** hides and clears the lighting-fee lead time.
3. Click **Save**.

If you leave any of these drawers with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a unit course

- Open the ⋮ menu and click **Disable** to retire a nine you no longer use.
  It stays on this screen (marked **Disabled**) for history, but it is not offered when setting up courses.
- Open the ⋮ menu of a disabled nine and click **Enable** to bring it back.

The message "OZ disabled." or "OZ enabled." confirms the change.

### Delete a unit course

[Screenshot: Delete unit course confirmation]

1. Open the ⋮ menu and click **Delete**.
2. The confirmation is titled **Delete unit course**; it names the nine and warns that its holes, tee boxes and closure plans are removed with it, that a nine still used by a course cannot be deleted, and that this cannot be undone.
3. Click **Delete unit course** to proceed, or **Cancel** to keep it.

Use Delete only for a nine keyed by mistake; a nine that has been played keeps its history, so disable it instead.

## Field reference

### New / Edit unit course drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Unit course code** | Yes | A short code identifying this nine, e.g. `OZ` for the Olazabal nine. It is shown everywhere the nine is referenced. | Up to 20 characters; stored in capitals; must be unique in your company. |
| **Type** | Yes | Where this nine may sit when paired into an 18-hole course: OUT (front only), IN (back only) or COMPOSITE (either). The type also fixes the hole numbering used in the Holes and Tees drawers. | Choose carefully: it drives hole numbers 1-9, 10-18, or 1-18. |
| **Number** | No | The display order of this nine in lists. | A whole number from 0 to 9999. |
| **Completion time (minutes)** | No | How long a flight typically needs to finish this nine, e.g. `110`. Used when planning tee times. | A whole number from 1 to 600. |
| **Description** | No | A fuller name for the nine, e.g. `Olazabal front nine`. | Up to 255 characters. |
| **Floodlit (night golf)** | No | Tick if this nine has lighting equipment and can be played after dark. | Ticking reveals the lighting-fee field below. |
| **Lighting fee starts (minutes before dark)** | No | How many minutes before dark the lighting fee begins to apply, e.g. `30`. | A whole number from 0 to 600. Only available while Floodlit is ticked. The dark time itself comes from Daylight / Dark Time Setup. |
| **Remarks** | No | Any internal note about the nine. | Up to 255 characters. |

### Holes drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Hole** | - | Shown, not entered: the hole numbers are fixed by the type (OUT 1-9, IN 10-18, COMPOSITE 1-18). | Every hole of the range is always listed. |
| **Par** | No | The hole's par. New holes are pre-set to 4. | 3, 4 or 5 (or "-" to leave it unset). |
| **HCP** | No | The hole's handicap index - its difficulty rank used for stroke allocation. | Front-nine holes (1-9) take an ODD index (1-17); back-nine holes (10-18) take an EVEN index (2-18). |
| **Remarks** | No | Any note about the hole, e.g. `Island green`. | Up to 255 characters. |

### Tee boxes drawer (one block per tee box)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Colour code** | Yes | The tee's colour name as printed on the scorecard, e.g. `BLUE`. | Up to 20 characters; stored in capitals; each colour may appear only once per nine. |
| **Colour** | No | The actual swatch shown for the tee - pick it from the colour picker. | Defaults to black. |
| **Number** | No | The tee's display order on the scorecard. | 1 to 5. |
| **Measurement** | No | Whether this tee's distances are in meters or yards. | Meter or Yard; the distance row's heading follows your choice. |
| **Description** | No | A note about the tee, e.g. `Championship tee`. | Up to 255 characters. |
| **Distance per hole** | No | The playing distance from this tee to each hole, one cell per hole, like a scorecard row. The OUT / IN subtotal (and the grand total on a COMPOSITE nine) is calculated automatically. | Each distance is a whole number from 1 to 2000. Leave a cell blank if not measured yet. |

## Tips & troubleshooting

- If you see "Unit course code is required (max 20 characters)." or "Type is required." under a field, fill it in before saving.
- If you see "Number must be between 0 and 9999.", "Completion time must be between 1 and 600 minutes." or "Lead time must be between 0 and 600 minutes." correct the number in that field.
- If you see "Unit course 'X' already exists." another nine in your company already uses that code; pick a different code.
- If you see "Hole n: par must be 3, 4 or 5." or "Hole n: handicap index must be an ODD number (1-17)." (or the EVEN back-nine version), pick from the values the dropdown offers for that hole.
- If you see "Every tee box needs a colour code." or "Tee box colour 'X' appears more than once." give each tee box its own colour code.
- If you see "Tee box 'X': number must be between 1 and 5." or "Tee box 'X', hole n: distance must be between 1 and 2000." correct that cell.
- If you see "Cannot delete X - course(s) EAST, WEST still use this nine. Repoint or delete those courses first." the nine is paired into those courses on the Courses screen; change or delete them first, or simply disable the nine.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- Saving the Holes or Tee boxes drawer replaces that whole set for the nine, so what you see in the drawer when you save is exactly what is stored.
- Set up unit courses in this order: create the nine, enter its holes, enter its tee boxes - then pair nines on the Courses screen.

## Related options

- **Courses** (Golf Management → Master File Setup → Courses) - pairs two unit courses (OUT + IN) into the 18-hole course players book; also holds the course photo and difficulty ratings.
- **Course Closure** (Golf Management → Common Setup → Course Closure) - closes a nine for maintenance or tournaments; closure plans are removed with the nine when it is deleted.
- **Daylight / Dark Time Setup** (Golf Management) - defines when dark falls; the lighting fee on a floodlit nine starts the configured number of minutes before that time.
