# Unit Courses

> **Where:** Golf Management → Master File Setup → Unit Courses
> **Who can use it:** users whose role includes the Golf Management module.

## What this option is for

The Unit Courses screen maintains your club's nine-hole course sections - the building blocks of golf setup.
Each unit course is one "nine" with its own holes (par and handicap index) and tee boxes (colours and per-hole distances).
A full 18-hole course is formed later, on the Course Setup screen, by pairing two unit courses: one as the OUT (front) nine and one as the IN (back) nine.
Staff come here first when setting up golf: define every nine the club has, enter its holes and tee boxes, and then go to Course Setup to pair them.

## The screen at a glance

[Screenshot: Unit Courses list]

- A count line shows how many unit courses exist and how many are active.
- A search box filters the list as you type; it matches the code, the description, and the type (OUT / IN / COMPOSITE).
- Each unit course is a card showing its code with a type tag, the description and remarks, the completion time, and whether the nine is floodlit (and when the lighting fee starts).
- A status chip shows **Active** or **Disabled**; disabled nines stay on this screen but cannot be used in new setups.
- Each card has four buttons: **Holes**, **Tees**, **Edit**, and a red **Disable** or green **Enable**.
- The **New unit course** button sits at the bottom right of the screen.

## Common tasks

### Add a new unit course

[Screenshot: New unit course dialog]

1. Click **New unit course**.
2. Enter the **Unit course code** (e.g. `OZ`) and pick the **Type**:
   - **OUT** - a front nine only (its holes are numbered 1-9).
   - **IN** - a back nine only (holes 10-18).
   - **COMPOSITE** - a nine that can play as either the front or the back.
3. Optionally set the **Number** (display order), the **Completion time** in minutes, and a **Description**.
4. If the nine has lighting equipment for night golf, tick **Floodlit** and set **Lighting fee starts** (how many minutes before dark the lighting fee begins).
5. Click **Save**.

The new nine appears in the list as Active.
Enter its holes and tee boxes next (below) before pairing it into an 18-hole course.

### Set up the holes (par and handicap index)

[Screenshot: Holes dialog]

1. Click **Holes** on the unit course's card.
2. The dialog lists every hole of the nine; the hole numbers are fixed by the type (OUT shows 1-9, IN shows 10-18, COMPOSITE shows 1-18) and cannot be changed.
3. For each hole pick the **Par** (3, 4 or 5; new holes start at par 4) and the **HCP** (handicap index), and add **Remarks** if needed.
4. Watch the **Total par** line at the bottom - a standard nine totals 35-36.
5. Click **Save … holes**.

About the HCP choices: front-nine holes (1-9) offer only ODD indexes (1-17) and back-nine holes (10-18) only EVEN indexes (2-18).
That way, when an OUT and an IN nine are paired into an 18-hole course, the course gets a complete handicap set of 1-18 with no clashes.

### Set up the tee boxes (colours and distances)

[Screenshot: Tee boxes dialog]

1. Click **Tees** on the unit course's card.
2. Click **Add tee box** for each tee the nine has (e.g. BLUE, WHITE, RED).
3. For each tee box enter the **Colour code**, pick the swatch **Colour**, optionally set the **Number** (display order 1-5), the **Measurement** unit (Meter or Yard), and a **Description**.
4. Fill in the **Distance per hole** row like a scorecard - one cell per hole; the OUT / IN subtotal and the grand total are calculated for you as you type.
5. Click **Save … tee boxes**.

Difficulty ratings (course and slope rating) are not entered here; they belong to the rated 18-hole course and are set up in Course Setup.

### Edit a unit course

1. Find the unit course (use the search box if the list is long) and click **Edit**.
2. Change what you need; unticking **Floodlit** also clears the lighting-fee lead time.
3. Click **Save**.

If you leave any of these dialogs with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a unit course

- Click the red **Disable** button to retire a nine you no longer use.
  It stays on this screen (marked **Disabled**) for history, but it is not offered when setting up courses.
- Click the green **Enable** button to bring it back.
- There is no delete: a nine that has been used in setups keeps its history.

## Field reference

### New / Edit unit course dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Unit course code** | Yes | A short code identifying this nine, e.g. `OZ` for the Olazabal nine. It is shown everywhere the nine is referenced. | Up to 20 characters; stored in capitals; must be unique in your company. |
| **Type** | Yes | Where this nine may sit when paired into an 18-hole course: OUT (front only), IN (back only) or COMPOSITE (either). The type also fixes the hole numbering used in the Holes and Tees dialogs. | Choose carefully: it drives hole numbers 1-9, 10-18, or 1-18. |
| **Number** | No | The display order of this nine in lists. | A whole number from 0 to 9999. |
| **Completion time (minutes)** | No | How long a flight typically needs to finish this nine, e.g. `110`. Used when planning tee times. | A whole number from 1 to 600. |
| **Description** | No | A fuller name for the nine, e.g. `Olazabal front nine`. | Up to 255 characters. |
| **Floodlit (night golf)** | No | Tick if this nine has lighting equipment and can be played after dark. | Ticking reveals the lighting-fee field below. |
| **Lighting fee starts (minutes before dark)** | No | How many minutes before dark the lighting fee begins to apply, e.g. `30`. | A whole number from 0 to 600. Only available while Floodlit is ticked. The dark time itself comes from Daylight / Dark Time Setup. |
| **Remarks** | No | Any internal note about the nine. | Up to 255 characters. |

### Holes dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Hole** | - | Shown, not entered: the hole numbers are fixed by the type (OUT 1-9, IN 10-18, COMPOSITE 1-18). | Every hole of the range is always listed. |
| **Par** | No | The hole's par. New holes are pre-set to 4. | 3, 4 or 5 (or "—" to leave it unset). |
| **HCP** | No | The hole's handicap index - its difficulty rank used for stroke allocation. | Front-nine holes (1-9) take an ODD index (1-17); back-nine holes (10-18) take an EVEN index (2-18). |
| **Remarks** | No | Any note about the hole, e.g. `Island green`. | Up to 255 characters. |

### Tee boxes dialog (one block per tee box)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Colour code** | Yes | The tee's colour name as printed on the scorecard, e.g. `BLUE`. | Up to 20 characters; stored in capitals; each colour may appear only once per nine. |
| **Colour** | No | The actual swatch shown for the tee - pick it from the colour picker. | Defaults to black. |
| **Number** | No | The tee's display order on the scorecard. | 1 to 5. |
| **Measurement** | No | Whether this tee's distances are in meters or yards. | Meter or Yard; the distance row's heading follows your choice. |
| **Description** | No | A note about the tee, e.g. `Championship tee`. | Up to 255 characters. |
| **Distance per hole** | No | The playing distance from this tee to each hole, one cell per hole, like a scorecard row. The OUT / IN subtotal and grand total are calculated automatically. | Each distance is a whole number from 1 to 2000. Leave a cell blank if not measured yet. |

## Tips & troubleshooting

- If you see "Unit course 'X' already exists." another nine in your company already uses that code; pick a different code.
- If you see "Hole n: front-nine holes take an ODD handicap index (1-17)." (or the EVEN back-nine version) the HCP does not fit the hole's numbering context; pick from the values the dropdown offers.
- If you see "Tee box colour 'X' appears more than once." two tee boxes share the same colour code; rename or remove one.
- If you see "Tee box 'X', hole n: distance must be a whole number between 1 and 2000." correct that cell of the distance row.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- Saving the Holes or Tee boxes dialog replaces that whole set for the nine, so what you see in the dialog when you save is exactly what is stored.
- Set up unit courses in this order: create the nine, enter its holes, enter its tee boxes - then pair nines in Course Setup.

## Related options

- **Course Setup** (Golf Management → Master File Setup → Course Setup) - pairs two unit courses (OUT + IN) into the 18-hole course players book; also holds the course photo and difficulty ratings.
- **Daylight / Dark Time Setup** (Golf Management) - defines when dark falls; the lighting fee on a floodlit nine starts the configured number of minutes before that time.
