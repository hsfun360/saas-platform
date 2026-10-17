# Caddy Station

> **Where:** Golf Management → Front Desk → Caddy Station
>
> **Who can use it:** users whose role includes the Golf Management module and this screen.
> Check-in, Next up and assigning need the Create permission; Check out, Complete and Swap need the Edit permission.
> The station only works while **Enable caddy management** is ticked on Golf Specification.

## What this option is for

The Caddy Station is the starter hut's caddy screen.
It checks the day's caddies in and keeps them in a queue, assigns them to the day's flights, records each round of service with the holes played, and handles a mid-round swap.
The station never decides who pays.
The caddy fee is charged at the Tee Time Sheet, and the station reads those fee lines to work out the **caddy slots** of each flight:

- a **single caddy** fee is one slot for that golfer;
- two **shared caddy** fees in the same flight pair into one slot for both golfers (golfers of the same booking pair first, then seat order);
- a shared fee with no partner in the flight waits until the partner's shared fee is paid, or the desk switches the golfer to the single fee;
- a slot is assigned only once every fee in it is **paid** - the bill settled.

A golfer with no caddy fee is listed as such and never receives a caddy; a complimentary caddy is given through a zero-priced caddy-fee item on the bill.
The grade of a caddy decides how many golfers they serve at once, so a one-bag grade cannot take a shared slot.

The queue is first in, first out: the first caddy checked in is **next up**, and a caddy who completes a round goes to the back.
A caddy who is not next up is assigned only when the player asked for that caddy by name.

Each round of service is kept on record with the caddy, the golfers, the holes and whether it counts, which is what the club settles its caddy pay from outside the system.

## The screen at a glance

[Screenshot: Caddy Station with the queue and a flight card]

- The **Play date** and **Course** filters at the top; the line beside them counts caddies checked in, available, on course and checked out.
- The **scan box**: type a badge number or scan the badge QR and press **Go**; **Camera** reads badges with the device camera; **Next up** names the caddy at the head of the queue and assigns them to the selected slot.
  A line under the box says what the next scan will do.
- The **Queue** card: the caddies waiting in order (the next one highlighted) with **Check out**, the caddies on course, and **Check in…**.
- A count line: flights registered, slots ready of slots waiting, rounds out.
- One card per flight with registered golfers: the time and course, booking numbers and the golfer count, then:
  - the **slots** - a tick for a slot that has its caddy (with the badge number and name), a radio-style button for a slot that is **ready** (fee paid), and a dashed note for a slot that is **blocked** with the reason;
  - **No caddy fee** - the golfers without a fee line;
  - the rounds out for the flight, each with **Swap** and **Complete**, and the rounds already completed or swapped.

## Common tasks

### Check caddies in

1. Scan a caddy's badge (a caddy not yet checked in is checked in by the scan), or click **Check in…** in the Queue card, find the caddy and click **Check in**.
2. The caddy joins the back of the queue.
   A caddy on leave for the day, inactive or blacklisted cannot check in.

### Assign the next caddy (queue order)

1. Tap the **ready** slot on the flight.
2. Click **Next up** (the button names the caddy), or scan that caddy's badge.
3. The message confirms "Caddy C-001 Ali assigned to Ahmad and Lee." and the slot shows the tick.

### Assign a caddy the player asked for

1. Tap the ready slot and scan the requested caddy's badge.
2. If that caddy is not next up, the station asks you to confirm **Player requested this caddy - assign**.
   The round is marked as requested by the player.

### Complete a round

1. Scan the caddy's badge (or click **Complete** on the round).
2. Check the **Holes played** (defaults to the registered holes; lower it for a round cut short), add a **Note** if needed, and tick **Check the caddy out for the day** when they are done.
3. Click **Complete round**.
   Unticked, the caddy goes to the back of the queue.

### Swap a caddy mid-round

1. Scan the caddy's badge and click **Swap instead**, or click **Swap** on the round.
2. Leave **Next up from the queue** ticked to take the head of the queue, or untick it, scan the replacement's badge and tick **Player requested this caddy** if they are out of turn.
3. Pick the **Reason** - caddy unwell or injured, player request, complaint against the caddy (the swapped-out round does not count), or other - and the hole if known.
4. Click **Swap caddy**.
   The golfers and their paid fees move to the replacement; the swapped-out caddy returns to the queue, where the desk may check them out.

### Check a caddy out

- Click **Check out** beside a waiting caddy in the Queue card.
  A caddy on course must complete the round first.
  A checked-out caddy who returns is checked in again by scanning, at the back of the queue.

## Field reference

### Scan box

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Scan or type the caddy badge** | Yes (to act) | The badge QR read by a scanner or camera, or the badge number typed. | Resolves to one caddy of the club; unknown codes are refused. |

### Complete round dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Holes played** | No | The holes the caddy served. | Whole number from 0 to the registered holes; defaults to all of them. |
| **Note** | No | Anything about the round. | Up to 255 characters. |
| **Check the caddy out for the day** | No | Tick when the caddy finishes for the day. | Unticked = back of the queue. |

### Swap caddy dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Next up from the queue** | No | Ticked = the head of the queue replaces the caddy. | Needs a caddy waiting. |
| **Replacement caddy** | When Next up is unticked | The badge QR or number of the replacement. | Must be checked in and waiting; out of turn only with the player's request. |
| **Player requested this caddy** | No | Tick when the player asked for the replacement by name. | Allows an out-of-turn replacement. |
| **Reason** | Yes | Caddy unwell or injured, Player request, Complaint against the caddy, Other. | A complaint means the swapped-out round does not count. |
| **At hole** | No | Where the swap happened. | Whole number from 1 to 18. |

## Tips & troubleshooting

- If you see "Caddy management is switched off (Golf Specification).", tick **Enable caddy management** there first.
- If you see "No caddy matches 'C-099'.", the badge is not a registered caddy - check the Caddies screen.
- If you see "Caddy C-003 is on sick leave on 2026-10-20.", the caddy cannot check in on that date; see the leave records on the Caddies screen.
- If you see "Caddy C-002 is next in the queue - assign C-005 out of turn only when the player asked for them (tick "Player requested this caddy").", confirm the player's request in the dialog, or assign the caddy who is next up.
- If you see "Ahmad has a shared caddy fee with no partner in this flight - pair another shared fee or switch the player to the single fee." or "Caddy fee not yet paid - Lee (bill G261000026).", settle the bills or fix the fee lines at the Tee Time Sheet first.
- If you see "Mei has no caddy fee on the bill - a complimentary caddy needs a complimentary caddy-fee item.", add the caddy fee (or the complimentary item) to the bill before assigning.
- If you see "Caddy C-001 (Trainee) serves 1 golfer - 2 picked.", the grade does not take a shared slot; pick a caddy of a grade that does.
- If you see "Caddy C-001 is already on the course - complete or swap that round first.", the caddy has an open round.
- If you see "Caddy C-001 is on the course - complete the round first.", complete the round before checking the caddy out.
- A handheld scanner must be set to send Enter after the code; the camera is optional and needs camera permission in the browser.

## Related options

- Golf Management → Front Desk → Tee Time Sheet - where the caddy fee reaches the bill and is paid; each golfer's line there shows the caddy once assigned.
- Golf Management → Common Setup → Caddies - the register, the badge QR sheet, leave and notes.
- Golf Management → Common Setup → Caddy Grades - the golfers a caddy serves at once.
- Golf Management → Common Setup → Transaction Type - the single and shared caddy fee items.
- Golf Management → Common Setup → Golf Specification - the Enable caddy management switch.
