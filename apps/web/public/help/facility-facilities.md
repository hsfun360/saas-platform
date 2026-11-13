# Facilities

> **Where:** Facility Management → Facilities
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New facility button needs the Create permission for this screen; Edit and the ⋮ menu (Closures, Enable/Disable) need the Edit permission; Delete needs the Delete permission as well.
> A facility that your role's data scope does not let you amend shows no Edit, Enable/Disable or Delete; its Closures entry stays and lists that facility's closure plans for viewing.

## What this option is for

The Facilities screen holds the physical units under each facility type - every court, every hall, the gym, the pool.
A facility is a place that is booked by time slot or entered on registration; how it is used comes from its facility type.
Come here when the club opens a new court or room, when a facility's details change, or when one is taken out of use.
The facilities of a time-slot type are what staff book on the Facility Bookings screen, the facilities of an entry type are entered at the Control Station, and any facility can be closed on the Facility Closures screen or linked to a class venue on the Venues screen.
Lockers, towels and showers are not facilities; they are set up under Utility Items.

## The screen at a glance

[Screenshot: Facilities list]

- A count line shows how many facilities exist and how many are active.
  When no facility type exists yet, it tells you to add the types under Facility Types first.
- A row of filter buttons - **All types** and one button per facility type that has facilities - narrows the list to one type.
  The row appears once facilities of more than one type exist.
- A search box filters the list as you type; it matches the facility's code, name and location, and the code and description of its type.
  When nothing matches, a **Clear filters** button resets the type filter and the search.
- Each facility is a card: its picture (or an icon when it has none), the title as code and name (e.g. `BC1 - Badminton Court 1`), a chip with its facility type, the location, **Indoor** and **Floodlit** chips where ticked, and **Capacity n** when the facility has its own capacity.
  Any remarks show on a line below.
- A status chip at the top right shows **Active** or **Disabled**; active facilities are listed first, grouped by facility type and then by sort order and code.
- Each card has an **Edit** button and a ⋮ menu holding **Closures**, **Enable** or **Disable**, and **Delete**.
- The **New facility** button floats at the bottom right of the screen once at least one facility type exists.

## Common tasks

### Add a new facility

[Screenshot: New facility dialog]

1. Click **New facility**.
2. Pick the **Facility type**.
   A line under the field tells you how facilities of that type are used: booked by the type's slot sets, or entered on registration at the Control Station.
   If a type filter is selected on the list, that type is already picked for you.
3. Enter the **Code** (e.g. `BC1`), the **Sort Order** and the **Name** (e.g. `Badminton Court 1`).
4. Optionally enter the **Location** (e.g. `Sports Hall, Level 2`).
5. For a facility of an entry type, optionally enter its own **Capacity**; leave it blank to count the facility under the type's capacity.
6. Tick **Indoor** and **Floodlit** where they apply.
7. Optionally add **Remarks** and click **Upload picture** to add a picture.
8. Click **Save**.

The facility appears in the list.
A facility of a time-slot type can be booked as soon as its type has slot sets.

### Edit a facility

1. Find the facility (use the filter buttons or the search box if the list is long) and click **Edit**.
2. Change what you need.
   The **Facility type** cannot be changed once the facility exists; to move a court or room to another type, create a new facility under that type and disable this one.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Change or remove the picture

1. Click **Edit** on the facility.
2. Click **Replace picture** to upload another image, or **Remove** to take the picture off.
3. Click **Save**.

### Close a facility for maintenance or an event

1. Open the card's ⋮ menu and click **Closures**.
2. The system takes you to the Facility Closures screen and opens the **New closure plan** dialog with this facility's type picked and the facility already ticked.
3. Complete the closure plan there (see the Facility Closures guide).

For a facility you may not amend, **Closures** opens the Facility Closures screen with the list narrowed to that facility's closure plans instead.
Your role needs the Facility Closures screen for either path.

### Disable / enable a facility

- Open the card's ⋮ menu and click **Disable** to take a facility out of use.
  A disabled facility can no longer be booked and is no longer offered when adding a closure plan or linking a venue; it stays on this screen and existing bookings stand.
- Open the ⋮ menu and click **Enable** to bring it back.

### Delete a facility

1. Open the card's ⋮ menu and click **Delete**.
2. Read the confirmation, which names the facility, and click **Delete facility**.

A facility cannot be deleted while a closure plan names it; delete those plans first, or disable the facility instead to keep its history.
Deleting cannot be undone.

## Field reference

### New / Edit facility dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Facility type** | Yes | The type this facility belongs to, e.g. `BADMINTON - Badminton`. It decides how the facility is used - slot booking or entry registration. | Only active facility types are offered; fixed once the facility exists. |
| **Code** | Yes | A short code for the facility, e.g. `BC1`. | Up to 20 characters; letters, digits, underscores and hyphens only; stored in capitals; must be unique across the club's facilities. |
| **Sort Order** | Yes | A number that decides the facility's position on the booking grid and in lists; lower numbers come first. | A whole number from 0 to 9999; default 100. |
| **Name** | Yes | The name staff see, e.g. `Badminton Court 1`. | Up to 255 characters. |
| **Location** | No | Where the facility is, e.g. `Sports Hall, Level 2`. Shown on the card. | Up to 255 characters. |
| **Capacity** | No | This facility's own limit of persons inside, for a club with, say, a second pool. | Shown for entry types only; a whole number from 1 to 100000; blank = the type's capacity applies. |
| **Indoor** | No | Tick for an indoor facility. Shown as a chip on the card. | Unticked by default. |
| **Floodlit** | No | Tick for a facility with floodlights. Shown as a chip on the card. | Unticked by default. |
| **Remarks** | No | Any note about the facility. Shown under the card's title line. | Up to 2000 characters. |
| **Picture** | No | A photo of the facility, shown on its card. Use **Upload picture**, **Replace picture** or **Remove**. | An image file of up to 2 MB. |

## Tips & troubleshooting

Codes and counts in the messages below are examples; yours show your own values.

- If you see "Facility 'BC1' already exists." the code is already used by another facility in this company, whatever its type; choose a different code.
- If you see "Code is required: 1-20 characters, letters, digits, underscores and hyphens only." correct the code; spaces are not accepted.
- If you see "Facility type, code and name are required." fill in those three fields.
- If you see "Pick a facility type of the active company." pick the facility type again; the one chosen no longer exists in this company.
- If you see "A facility cannot move to another facility type. Create a new facility under that type instead." do as it says and disable the old facility.
- If you see "Capacity must be a whole number between 1 and 100000, or blank." or "Sort order must be a whole number between 0 and 9999." correct that box.
- If you see "Cannot delete BC1 - 2 closure plans still name it. Delete those first." delete those plans on the Facility Closures screen, or disable the facility instead.
- If you see "Your role's data scope does not allow amending this record." the facility was created by someone outside your data scope; ask its owner or an administrator to change it.
- If you see "Select a workspace first." pick your company at the top of the screen.
- If the **New facility** button is missing, no facility type exists yet (add one under Facility Types) or your role lacks the Create permission.
- If a facility type is missing from the **Facility type** list, it is disabled; enable it under Facility Types.
- Prefer **Disable** to **Delete** for a facility that has been in use, so its history is kept.
- The **Capacity** box does not appear for courts and halls: a time-slot facility is limited by its slots, not by a head count.
- Use a code pattern that sorts well and reads at a glance, such as `BC1` to `BC8` for badminton courts and `TC1` to `TC4` for tennis courts.

## Related options

- Facility Management → Facility Types - the kinds of facility and their rules; a facility always belongs to one type.
- Facility Management → Facility Closures - close a facility, or every facility of a type, over a date period.
- Facility Management → Facility Bookings - where facilities of time-slot types are booked.
- Facility Management → Control Station - where facilities of entry types are entered on registration.
- Facility Management → Venues - class venues that can be linked to a facility.
- Facility Management → Utility Items - lockers, towels and showers, which are not facilities.
