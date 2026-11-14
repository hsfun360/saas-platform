# Facility Types

> **Where:** Facility Management → Facility Types
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New facility type button needs the Create permission for this screen; Edit, the ⋮ menu (Slot sets, Enable/Disable) and Add slot set need the Edit permission; Delete (of a type or of a slot set) needs the Delete permission as well.
> A facility type that your role's data scope does not let you amend shows no Edit, Enable/Disable or Delete; its Slot sets still open, view only.

## What this option is for

A facility type is a kind of facility your club runs, together with its rules - Badminton, Tennis, the Gym, the Pool.
Every facility (each court, each hall, the gym) belongs to one type, so set up the types here before adding facilities on the Facilities screen.
The **Usage Mode** of a type decides how its facilities are used: **Time slot booking** for courts and halls that are booked by fixed time slots, or **Entry registration** for the gym and the pool, where people are registered on arrival.
For a time-slot type this screen also holds the **slot sets** - the list of bookable time slots that every facility of the type shares.
The rules you set here (booking limits, capacity, opening hours, guest policy, automatic fees, approval) are applied on the Facility Bookings screen and at the Control Station.
Lockers, towels and showers are not facility types; they are set up under Utility Items.

## The screen at a glance

[Screenshot: Facility Types list]

- A count line shows how many facility types exist and how many are active.
- A row of filter buttons - **All modes**, **Time slot booking**, **Entry registration** - narrows the list to one usage mode.
- A search box filters the list as you type; it matches the code and the description.
  When nothing matches, a **Clear filters** button resets the mode filter and the search.
- Each type is a card: its icon, the title as code and description (e.g. `BADMINTON - Badminton`), a chip with the usage mode, how many facilities belong to it (and how many of them are active when some are disabled), the number of slot sets for a time-slot type, and a **No guests** chip when visitor guests are not allowed.
  A line below sums up the rules: slots per day, consecutive slots and participants for a time-slot type, or **Capacity n** / **No capacity cap** for an entry type.
- A status chip at the top right shows **Active** or **Disabled**; active types are listed first, then by sort order and code.
- Each card has an **Edit** button and a ⋮ menu holding **Slot sets (n)** (time-slot types only), **Enable** or **Disable**, and **Delete**.
- The **New facility type** button floats at the bottom right of the screen.
- Several labels in the dialogs carry a small information icon; hover over it or click it to read a longer explanation of the field.

## Common tasks

### Add a new facility type

[Screenshot: New facility type dialog]

1. Click **New facility type**.
2. Under **Identity**, enter the **Code** (e.g. `BADMINTON`), the **Description** (e.g. `Badminton`) and the **Sort Order**.
3. Pick the **Usage Mode**: **Time slot booking** or **Entry registration**.
   The sections below change with the mode you pick.
4. Optionally click **Upload icon** to give the type a tile icon.
5. For a time-slot type, fill in **Slot booking rules**: the slots a member may hold per day, the consecutive slots one booking may take, the advance booking days and the participants per booking.
6. For an entry type, fill in **Entry rules** (the capacity and whether entry needs a booking) and **Opening hours**.
7. Under **Guest policy**, tick what is allowed for guests and set the maximum guests.
8. Under **Fees and approval**, pick the fees to charge automatically and switch on approval or the no-show options if you need them.
9. Click **Save**.

The type appears in the list and can now be picked on the Facilities screen.
A time-slot type still needs its slot sets before anything can be booked: open them from the card's ⋮ menu (see the next task).

### Set up the slot sets of a time-slot type

[Screenshot: Slot sets dialog]

A slot set defines the bookable slots for a day scope from an effective date.
One set for **All days** is enough when every day runs the same; add a **Weekends** set when weekends run differently, and a new set with a later effective date when the schedule changes.

1. Open the card's ⋮ menu and click **Slot sets (n)**.
2. Click **Add slot set**.
3. Pick the **Day scope** (**All days**, **Weekdays** or **Weekends**; public holidays count as weekends) and the **Effective date**.
4. Optionally enter a **Description** (e.g. `Weekend schedule`).
5. Enter when the **First slot starts**, when the **Last slot starts** and the **Slot length (minutes)**.
6. Optionally set **Front desk from**: slots from this time are walk-in only, with no advance booking.
7. Check the preview line under the fields - it states how many slots of what length will be created, from when to when.
8. Click **Save and generate n slots** (the button states the number of slots it will create).

The set appears in the list with its slots already generated.
Each set in the list shows its day scope and effective date, an **Active** or **Disabled** chip, its times, slot length and number of slots (with how many are switched off), and the front desk time when one is set.
**Back to list** returns to the slot sets without saving what you typed, and **Close** leaves the Slot sets dialog.

### Adjust the slots of a set

[Screenshot: Slots dialog]

1. In the Slot sets list, click **Slots (n)** on the set.
2. Change a slot's **Start** or **End** time where needed.
3. Untick **On** for a slot that should not exist that day, such as a lunch break.
4. Tick **Front desk** for a slot that takes walk-ins only, with no advance booking.
5. Click **Save n slots**.

To throw away the hand adjustments and start again, click **Regenerate slots (...)** - the button names the times and slot length it will use.
The list is refilled for you to review; nothing is saved until you click **Save n slots**.
On a set that has no slots the same button reads **Generate slots (...)**.
**Back to list** returns to the slot sets without saving.

### Change a slot set's times

1. In the Slot sets list, open the set's ⋮ menu and click **Edit**.
2. Change the day scope, the effective date, the times or the slot length.
3. Tick **Regenerate the slots from these times (replaces any hand adjustments)** if the slots should follow the new times.
   Without the tick only the set's details are saved and its slots stay exactly as they were.
4. Click **Save**.

When a schedule changes from a certain date, it is usually better to add a new set with that effective date than to edit the set in use.

### Disable, enable or delete a slot set

- In the Slot sets list, open the set's ⋮ menu and click **Disable** to take the set out of use, or **Enable** to bring it back.
  A disabled set is ignored when the system looks up the slots for a date.
- Click **Delete** in the same menu to remove the set with all its slots.
  The system asks you to confirm, and this cannot be undone.

### Edit a facility type

1. Find the type (use the filter buttons or the search box if the list is long) and click **Edit**.
2. Change what you need.
   The **Usage Mode** cannot be changed once a facility exists under the type; the dialog shows it as frozen with the number of facilities.
3. Click **Save**.

If you change the usage mode of a type that has no facilities yet, the rules of the other mode are reset when you save.
If you leave the type form, the slot set form or the slot list with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a facility type

- Open the card's ⋮ menu and click **Disable** to retire a type you no longer use.
  A disabled type can no longer be booked, is not shown at the Control Station and is not offered when adding a facility or a closure plan; it stays on this screen and existing bookings stand.
- Open the ⋮ menu and click **Enable** to bring it back.

### Delete a facility type

1. Open the card's ⋮ menu and click **Delete**.
2. Read the confirmation: it names the type and how many slot sets go with it, or tells you that the type still has facilities.
3. Click **Delete facility type**.

A type that still has facilities cannot be deleted; the system refuses, so delete those facilities first, or disable the type to keep it out of use.
Deleting a type also removes its slot sets and closure plans, and cannot be undone.

## Field reference

### New / Edit facility type dialog - Identity

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code for the type, e.g. `BADMINTON`. It is the key the booking limits, rate cards and reports use. | Up to 20 characters; letters, digits and underscores only; stored in capitals; must be unique in the company. |
| **Sort Order** | Yes | A number that decides where the type sits in lists; lower numbers come first. | A whole number from 0 to 9999; default 100. |
| **Description** | Yes | The name staff see, e.g. `Badminton`. | Up to 255 characters. |
| **Usage Mode** | Yes | **Time slot booking** for courts and halls booked by fixed slots from the type's slot sets. **Entry registration** for the gym and pool, registered on arrival and optionally capped. | Decides which sections below apply; frozen once a facility exists under the type. |
| **Tile icon** | No | A small picture for the type, shown on the booking grid and the station tiles. Use **Upload icon**, **Replace icon** or **Remove**. | An image file of up to 2 MB. |

### New / Edit facility type dialog - Slot booking rules (time-slot types)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Slots per day, weekday** | Yes | How many slots of this type one member may hold on one weekday, counted as the booker or as a participant; cancelled bookings free the count. | A whole number from 0 to 50; 0 = no limit. |
| **Slots per day, weekend and holiday** | Yes | The same limit for weekends and public holidays. | A whole number from 0 to 50; 0 = no limit. |
| **Max consecutive slots** | Yes | How many adjacent slots on one facility a single booking may take; a hall hired by the hour sets a high number. | A whole number from 0 to 50; 0 = no limit. |
| **Advance booking days** | No | How many days ahead this type may be booked, when it differs from the general rule in Facility Specification. | A whole number from 0 to 365; leave blank to follow the general rule. |
| **Min participants** | Yes | The number of participants a booking must name. | A whole number from 1 to 500; 1 = no rule; cannot exceed Max participants. |
| **Max participants** | No | What one court holds, e.g. `4` for badminton. | A whole number from 1 to 500; leave blank when participants are not tracked (a hall). |

### New / Edit facility type dialog - Entry rules (entry types)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Capacity** | No | The number of persons inside at one time across all facilities of this type. The Control Station shows the live count and refuses entry past it. | A whole number from 1 to 100000; blank = unlimited. |
| **Entry needs a booking of a slot type that day** | No | Switch on for an entry desk that only admits a member who holds a booking of a time-slot type that day. Leave off for the gym and the pool. | Off by default. |

### New / Edit facility type dialog - Opening hours (entry types)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Weekday open** / **Weekday close** | No | The times between which the type is open on weekdays. | Set both or neither; leave both blank for no restriction; close must be after open. |
| **Weekend and holiday open** / **Weekend and holiday close** | No | The times between which the type is open on weekends and public holidays. | Set both or neither; leave both blank for no restriction; close must be after open. |

Time-slot types have no opening hours of their own; they take their hours from the slot sets.

### New / Edit facility type dialog - Guest policy

These settings take effect only while guest control is switched on in Facility Specification, and they only tighten the general rules there.

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Visitor guests allowed** | No | Untick to allow no visitor guest under this type at all. The card then shows a **No guests** chip. | Ticked by default. |
| **Members may join another member's booking or visit** | No | Untick to stop a member joining another member's booking or visit under this type. | Ticked by default. |
| **The host member must be present for guests to be admitted** | No | Tick when guests are admitted only with their host member. | Ticked by default. |
| **Max guests per booking** (time-slot) / **Max guests per visit** (entry) | No | The most visitor guests one booking or one visit may bring. Guests also count against the member's monthly allowance. | A whole number from 0 to 100; blank = no limit; 0 = none at all. |

### New / Edit facility type dialog - Visiting members

Shown for an entry type only.

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Visiting members allowed** | No | On = a member of an affiliated or reciprocal club may enter on the day pass they received at the Registration Counter, and a guest they brought may enter once they are inside. Off = neither may enter; the card then shows a **No visiting members** chip. | On by default. Always in force, whatever guest control says. Their entry fee is the price of Affiliated Member or Reciprocal Member on the entry fee item's price card; with a fee item and no such price the station keeps the facility closed to them. |

### New / Edit facility type dialog - Fees and approval

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Facility fee charged automatically** (time-slot) / **Entry fee charged automatically** (entry) | No | The Facility Fee transaction type charged when a bill opens: once per reserved slot for a time-slot type, once per registration for an entry type. Type to search the list. | Only active Facility Fee transaction types of this facility type, or of no particular type, are offered; **No automatic charge** leaves it empty. |
| **Guest fee charged automatically** | No | The Guest Fee transaction type charged once per guest participant. | Only active Guest Fee transaction types of this facility type, or of no particular type, are offered; **No automatic charge** leaves it empty. |
| **Every booking of this type needs approval** | No | Switch on to hold every booking of this type pending approval. It follows the approval chain set up for facility bookings; with no chain set up it is approved at once. | Off by default. |
| **Charge no-shows and late cancellations on this type** | No | Switch off to exempt this type from no-show and late-cancellation charges. | Time-slot types only; on by default; applies only while no-show control is on in Facility Specification. |
| **Count no-shows on this type as strikes** | No | Switch on to count a no-show on this type as a strike against the member. | Time-slot types only; off by default; applies only while no-show control is on in Facility Specification. |

### New / Edit slot set dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Day scope** | Yes | Which days the set applies to: **All days**, **Weekdays** or **Weekends**. | Public holidays count as weekends. |
| **Effective date** | Yes | The date from which the set is in force, picked from the calendar. | One set per day scope and effective date. |
| **Description** | No | A label for the set, e.g. `Weekend schedule`. | Up to 255 characters. |
| **First slot starts** | Yes | The start time of the first slot of the day, e.g. `07:00`. | Must not be after the last slot. |
| **Last slot starts** | Yes | The start time of the last slot of the day, e.g. `21:00`. | The last slot must end by midnight. |
| **Slot length (minutes)** | Yes | How long each slot lasts, e.g. `60`. Every slot of the set has this length. | A whole number from 15 to 240; default 60; a set cannot have more than 200 slots. |
| **Front desk from** | No | A time from which slots are walk-in only, with no advance booking. | Slots starting at or after this time are generated with **Front desk** ticked. |
| **Regenerate the slots from these times (replaces any hand adjustments)** | No | Tick to rebuild the slots from the times above when you save. | Shown when editing a set only; unticked by default. |

### Slots dialog (one row per slot)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **#** | - | Shown, not entered: the slot's number within the set. | - |
| **Start** | Yes | The time the slot starts. | Slots must not overlap one another. |
| **End** | Yes | The time the slot ends. | Must be after the start. |
| **On** | No | Tick while the slot exists that day; untick a break such as lunch. | An unticked slot is not offered for booking. |
| **Front desk** | No | Tick for a slot that takes walk-ins only, with no advance booking. | - |

## Tips & troubleshooting

Codes, counts and times in the messages below are examples; yours show your own values.

- If you see "Facility type 'BADMINTON' already exists." the code is already used by another type in this company; choose a different code or edit the existing type.
- If you see "Code is required: 1-20 characters, letters, digits and underscores only." correct the code; spaces and hyphens are not accepted here.
- If you see "Code, description and usage mode are required." fill in those three fields.
- If you see "Usage mode is frozen: 8 facilities already exist under BADMINTON." the mode cannot be changed any more; create a new type with the other mode instead.
- If you see "Delete the 2 slot sets of BADMINTON before changing its usage mode." remove the type's slot sets first.
- If you see "Min participants cannot exceed max participants." lower the minimum or raise the maximum.
- If you see "Weekday opening hours need both an open and a close time, or neither." (or the same for Weekend) one of the two times is empty.
- If you see "Weekday close time must be after the open time." (or the same for Weekend) correct the times.
- If you see "Facility fee default: 'COURTFEE' is not a facility fee." or "Guest fee default: 'GUESTFEE' is not a guest fee." the transaction type picked has the wrong charge type; pick another.
- If you see "Facility fee default: 'COURTFEE' is disabled." or "Facility fee default: 'COURTFEE' belongs to another facility type." (or the same starting with "Guest fee default:") pick a different transaction type, or correct that one under Transaction Types.
- If the two fee lists are empty, no active Facility Fee or Guest Fee transaction type exists yet, or your role cannot open Transaction Types.
- If you see "Cannot delete BADMINTON - 8 facilities still belong to it. Delete those first." delete the facilities on the Facilities screen, or disable the type instead.
- If you see "This facility type already has a slot set for that day scope and effective date." edit the existing set or choose another effective date.
- If you see "Slot length must be a whole number of minutes between 15 and 240." correct the slot length.
- If you see "The last slot must not start before the first slot." or "The last slot must end by midnight." correct the two start times or the slot length.
- If you see "A slot set cannot have more than 200 slots - lengthen the slots or shorten the day." do as it says.
- If you see "Slot 5: start and end times are required." or "Slot 5: the end must be after the start." correct that row in the slot list.
- If you see "Slots 4 and 5 overlap." one slot starts before the previous one ends.
- If you see "BADMINTON is not a time-slot facility type." slot sets can only be added to a type whose usage mode is Time slot booking.
- If you see "Your role's data scope does not allow amending this record." the type was created by someone outside your data scope; ask its owner or an administrator to change it.
- If you see "View only - your role's data scope does not allow amending BADMINTON." you can look at the slot sets and slots of that type but not change them.
- If you see "Select a workspace first." pick your company at the top of the screen.
- For a given date the system uses the active slot set with the latest effective date on or before that date.
  A Weekdays or Weekends set that matches the day always wins over an All days set.
- Editing a slot set's times does not change its slots unless you tick **Regenerate**; check the slot count on the set's line after saving.
- Prefer **Disable** to **Delete** for a type that has been in use; deleting removes its slot sets and closure plans for good.
- Keep codes short and recognisable (`TENNIS`, `GYM`, `POOL`); they appear on cards, closure plans and messages across Facility Management.

## Related options

- Facility Management → Facilities - the courts, halls and rooms that belong to each type.
- Facility Management → Facility Closures - close a whole type, or single facilities of it, for maintenance or an event.
- Facility Management → Facility Specification - the general booking window, guest control and no-show control that the type's rules refine.
- Facility Management → Transaction Types - the Facility Fee and Guest Fee items picked under Fees and approval, with their rate cards.
- Facility Management → Facility Bookings - where the slots defined here are booked.
- Facility Management → Control Station - where entry types are registered on arrival and capacity is counted.
- Facility Management → Utility Items - lockers, towels and showers, which are not facility types.
- System Setup → Companies → Weekend days and System Setup → Public Holidays - decide which dates count as weekdays and weekends.
