# Buggy Station

> **Where:** Golf Management → Front Desk → Buggy Station
>
> **Who can use it:** users whose role includes the Golf Management module and this screen.
> Issuing a buggy needs the Create permission; Return and Swap need the Edit permission.
> The station only works while **Enable buggy management** is ticked on Golf Specification.

## What this option is for

The Buggy Station is the starter hut's screen: it issues the club's buggies to the day's flights, takes them back, and swaps a unit that breaks down mid-round.
The station never decides who pays.
The buggy fee is charged at the Tee Time Sheet (automatically on a buggy-compulsory course, or from the tiles), and the station reads those fee lines to work out the **buggy slots** of each flight:

- a **single buggy** fee is one slot for that player;
- two **shared buggy** fees in the same flight pair into one slot for both riders (players of the same booking pair first, then seat order);
- a shared fee with no partner in the flight waits and cannot be issued until the partner's shared fee is paid, or the desk switches the player to the single fee;
- a slot is issued only once every fee in it is **paid** - the bill settled.

A player with no buggy fee is listed as such; on a course that is not buggy-compulsory the operator may still give them a unit (it is recorded as issued without a fee).
On a buggy-compulsory course the fee must be on the bill first.

Each buggy takes one scan: tap the slot and scan the unit, or scan the unit and tap the slot.
Scanning a unit that is already out opens Return / Swap.

## The screen at a glance

[Screenshot: Buggy Station with the scan box and a flight card]

- The **Play date** and **Course** filters at the top; the fleet line shows how many units are active, in the depot and on the course.
- The **scan box**: type a buggy number or scan the QR label into it and press **Go**; **Camera** opens the device camera to read labels.
  A line under the box says what the next scan will do - "Buggy B-012 ready - tap the slot it goes to" or "Scan the buggy for Ahmad and Lee (07:36 E1)".
- A count line: flights registered, slots ready of slots waiting, and units out.
- One card per flight with registered players, in tee-time order: the time and course, a **Buggy compulsory** chip where it applies, the booking numbers and the player count.
- Inside each card:
  - the **slots** - a tick for a slot already on a buggy (with the unit's number), a radio-style button for a slot that is **ready** (fee paid), and a dashed note for a slot that is **blocked** with the reason (waiting for a partner, or the fee not yet paid with the bill number);
  - **No buggy fee** - the players without a fee line, as buttons on a non-compulsory course or plain chips on a compulsory one;
  - the units **out** for the flight, each with **Swap** and **Return**.
- **Out now** at the bottom lists every unit still out, including earlier flights and other days, with the same Swap and Return.

## Common tasks

### Issue a buggy (tap, then scan)

1. Find the flight and tap the **ready** slot - the slot highlights and the hint reads "Scan the buggy for …".
2. Scan the unit's QR label with the handheld scanner, or with the **Camera**, or type its number and press **Go**.
3. The message confirms "Buggy B-012 issued to Ahmad and Lee." and the slot shows a tick with the unit's number.

### Issue a buggy (scan, then tap)

1. Scan or type the unit first; the hint reads "Buggy B-012 ready - tap the slot it goes to."
2. Tap the ready slot; the unit is issued at once.
3. **Clear** on the hint line forgets the scanned unit if you picked the wrong one.

### Issue a buggy to a player with no fee (non-compulsory course only)

1. Under **No buggy fee** tap the player (or two players riding together); the hint names them.
2. Scan the unit.
   The outing is recorded without a fee line and the message says so.

### Return a buggy

1. Scan the returning unit (or click **Return** on its line).
2. In **Return buggy B-012**, leave **Condition** as **Good**, or pick **Fault** or **Damaged** and write what was found in **Remarks**.
3. Click **Return buggy**.
   The unit is back in the depot and free for the next flight.

### Swap a buggy that broke down

1. Scan the broken unit (or click **Swap** on its line); in the Return dialog click **Swap instead**, or click **Swap** directly.
2. Scan or type the **Replacement buggy**, give the **Reason** (e.g. `Battery flat`) and, if known, the hole.
3. Pick the **Condition** of the broken unit and any remarks, then click **Swap buggy**.
   The riders and their paid fees move to the replacement; the broken unit returns to the depot with its condition noted.

### Work from a phone

1. Scan the sticker with the phone's camera app; the station opens on that unit.
2. Tap the slot it goes to (or, if the unit is out, use the Return / Swap dialog that opens).

## Field reference

### Scan box

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Scan or type the buggy** | Yes (to act) | The QR code read by a scanner or camera, or the buggy number typed. | Resolves to one unit of the club; unknown codes are refused. |

### Return buggy dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Condition** | Yes | Good, Fault or Damaged. | Defaults to Good. |
| **Remarks** | When the condition is not Good | What was found on the unit. | Up to 255 characters. |

### Swap buggy dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Replacement buggy** | Yes | The QR code or number of the unit taking over. | Must be an active unit in the depot, different from the broken one, with enough seats for the riders. |
| **Reason** | Yes | Why the unit is swapped. | Up to 255 characters. |
| **At hole** | No | Where on the course the swap happened. | Whole number from 1 to 18. |
| **Condition of <unit>** | Yes | Fault, Damaged or Good for the unit coming back. | Defaults to Fault. |
| **Remarks** | No | Anything else about the unit coming back. | Up to 255 characters. |

## Tips & troubleshooting

- If you see "Buggy management is switched off (Golf Specification).", tick **Enable buggy management** there first.
- If you see "No buggy matches 'B-099'.", the code or number is not a registered unit - check the Buggies screen.
- If you see "Ahmad has a shared buggy fee with no partner in this flight - pair another shared fee or switch the player to the single fee.", the shared fee needs a second paid shared fee in the same flight; ask the desk to add the partner's fee or change Ahmad's line to the single fee.
- If you see "Buggy fee not yet paid - Lee (bill G261000024).", the rider's bill is still open; settle it at the Tee Time Sheet first.
- If you see "E1 is buggy-compulsory - Ahmad has no buggy fee on the bill yet.", the fee must be on the bill before a unit is issued on that course.
- If you see "Ahmad and Lee do not form one buggy slot as picked - issue the slots the fees define.", the players you picked belong to different slots; tap one slot at a time.
- If you see "Buggy B-012 is already out with Ahmad - return it first.", "Buggy B-012 is retired." or "Buggy B-012 is in maintenance.", pick another unit.
- If you see "Buggy B-012 seats 2 - 3 riders picked.", split the riders over two units.
- If you see "Ahmad already has a buggy out - swap or return it first.", the player is already riding.
- If you see "Describe the fault or damage.", a return with a condition other than Good needs remarks.
- If the camera does not start, allow camera access for the app in the browser, or keep using a handheld scanner or the typed number - the camera is optional.
- A handheld scanner must be set to send Enter after the code; the box then submits on its own.

## Related options

- Golf Management → Front Desk → Tee Time Sheet - where the buggy fee reaches the bill (auto-charged on a buggy-compulsory course, or from the tiles) and is paid; each player's line there shows the buggy number once issued.
- Golf Management → Common Setup → Buggies - the fleet register, the QR labels and each unit's history.
- Golf Management → Common Setup → Buggy Types - the seats a unit carries.
- Golf Management → Common Setup → Courses - the Buggy compulsory switch per course.
- Golf Management → Common Setup → Transaction Type - the single and shared buggy fee items.
- Golf Management → Common Setup → Golf Specification - the Enable buggy management switch.
