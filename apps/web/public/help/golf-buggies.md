# Buggies

> **Where:** Golf Management → Common Setup → Buggies
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New, Edit, Retire, Reinstate, New QR code and Delete controls appear only when your role holds the matching Create, Edit or Delete permission for this screen; History and Print label are open to everyone with the screen.

## What this option is for

The Buggies screen is the club's fleet register: one record per buggy with its type, model, serial number and purchase date, the QR label printed on it, and where it is right now.
The location is kept by the system, not typed: the Buggy Station moves a unit **On course** when it issues it and back **In depot** when it is returned; a unit under repair reads **In maintenance**.
A unit the club no longer runs is **retired** - it leaves the active fleet but keeps its history; a mis-keyed record with no outing on it can be deleted.
Staff come here to register new units, print the QR labels the Buggy Station scans, see which buggies are out and with whom, read a unit's history and retire old ones.

## The screen at a glance

[Screenshot: Buggies fleet board and list]

- Five tiles at the top show the live counts - **Active fleet**, **In depot**, **On course**, **In maintenance** and **Retired** - and clicking a tile filters the list to that state.
- A search box filters as you type; it matches the buggy number, type, model, serial number and the names of the riders a unit is out with.
- **Print QR labels (n)** beside the search prints the label sheet for every active unit.
- Each buggy is a card: the buggy number and type as the title, chips for the seats and the model, serial and purchase date, and - when the unit is out - who has it, the tee time and since when.
- A status chip at the top right reads **In depot**, **On course**, **Maintenance** or **Retired**.
- Each card has an **Edit** button and a ⋮ menu holding **History**, **Print label**, **New QR code**, **Retire** or **Reinstate**, and **Delete**.
- The **New buggy** button floats at the bottom right of the screen.
- A note at the top says when buggy management is switched off in Golf Specification: the fleet can be keyed, but the station issues nothing until it is on.

## Common tasks

### Register a buggy

[Screenshot: New buggy dialog]

1. Click **New buggy**.
2. Enter the **Buggy No** - the asset tag on the unit (e.g. `B-012`); it is stored in capitals.
3. Pick the **Buggy Type** - type a few letters to filter the list.
4. Optionally enter the **Model**, **Serial No**, **Purchase Date** and **Remarks**.
5. Click **Save**.

The unit joins the active fleet in the depot and receives its own QR code at once.

### Print the QR labels

1. Click **Print QR labels (n)** above the list to print every active unit, or open a card's ⋮ menu and click **Print label** for one unit.
2. The label sheet opens in a new tab; click **Print** there.
3. Fit each sticker to its buggy - the label shows the QR code, the buggy number, the club name and the type.

The QR code opens the Buggy Station on that unit when scanned with a phone camera, and a handheld scanner reads it straight into the station's code box.

### See where a buggy is and with whom

- Click the **On course** tile; each card shows the riders, the tee time and when the unit went out.
- Open a card's ⋮ menu and click **History** to read every outing of the unit - date and tee time, riders, out and back times, the condition on return, and any mid-round swap with its reason and hole.

### Replace a lost or damaged label

1. Open the card's ⋮ menu and click **New QR code**.
2. Confirm; the old sticker stops working the moment the new code is issued.
3. Click **Print label** and fit the new sticker.

### Park a unit for service or repair, or inspect it

- Open the card's ⋮ menu and click **Open service** or **Open repair** (a unit in the depot only); describe the work planned or the fault found and confirm.
  The unit moves to **In maintenance** and the card shows the open job; the Buggy Station cannot issue it until the job is completed on Buggy Maintenance.
- Click **Inspect** to run the safety checklist on the unit: untick any faulty system among **Steering**, **Brakes**, **Electrical**, **Drive** and **Body** and describe the fault.
  All clear records the inspection and leaves the unit where it is; a fault opens a repair and parks it.

### Retire, reinstate or delete a buggy

- Open the card's ⋮ menu and click **Retire**; give the **Reason** (sold, written off) and click **Retire buggy**.
  A unit that is out on the course must be returned first.
- Click **Reinstate** on a retired unit to bring it back into the active fleet, in the depot.
- Click **Delete** to remove a record that has no outing yet; the system refuses once the unit has history - retire it instead.

## Field reference

### New / Edit buggy dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Buggy No** | Yes | The asset tag printed on the unit and its label, e.g. `B-012`. | Letters, digits and hyphens, up to 20 characters, stored in capitals; unique in the fleet. |
| **Buggy Type** | Yes | The kind of buggy, from Buggy Types. | An active type of your company; a unit out on the course cannot change type until it is back. |
| **Model** | No | The make and model, e.g. `Club Car Tempo`. | Up to 100 characters. |
| **Serial No** | No | The manufacturer's serial number. | Up to 100 characters. |
| **Purchase Date** | No | The date the unit was bought; pick from the calendar. | |
| **Remarks** | No | Anything the depot should know about the unit. | Up to 255 characters. |

### Retire buggy dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes | Why the unit leaves the fleet. | Up to 255 characters. |

## Tips & troubleshooting

- If you see "Buggy B-012 already exists.", another unit carries that number.
- If you see "The buggy type is not one of this company's types." or "Buggy type 'X' is disabled - pick an active type.", pick an active type from the list.
- If you see "No active buggy types yet - add one under Buggy Types first.", set up at least one type before registering units.
- If you see "Buggy B-012 is on course - return it first.", the unit is out; return it at the Buggy Station before retiring it or changing its type.
- If you see "Buggy B-012 has 34 outing(s) on record - retire it instead.", a unit with history cannot be deleted.
- If you see "No buggies to print.", there is no active unit (or none of the ones picked) to put on the sheet.
- If you see "Your role's data scope does not allow amending this record.", the unit was registered by someone outside your data scope.
- If you see "Buggy B-012 already has an open repair - complete it first.", the unit is already parked; complete the job on Buggy Maintenance.
- Printing opens a new browser tab; allow pop-ups for the app if nothing appears.

## Related options

- Golf Management → Common Setup → Buggy Types - the kinds of buggy and their seats.
- Golf Management → Front Desk → Buggy Station - issues, returns and swaps the units registered here.
- Golf Management → Buggy Management → Buggy Maintenance - the services, repairs and inspections that park a unit; jobs opened here are completed there.
- Golf Management → Buggy Management → Buggy Damages - the damage register.
- Golf Management → Common Setup → Golf Specification - the Buggies switch that opens the station.
- Golf Management → Common Setup → Courses - which courses make the buggy compulsory.
