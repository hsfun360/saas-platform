# Buggy Damages

> **Where:** Golf Management → Buggy Management → Buggy Damages
>
> **Who can use it:** users whose role includes the Golf Management module and this screen.
> Record damage needs the Create permission; Edit and Resolve need Edit.

## What this option is for

Buggy Damages is the register of damage to the fleet: one record per incident with the unit, the date, who or what caused it (a player, staff, or not caused by a person), the rider held responsible when known, and what happened.
Compensation is **not** handled in the system - the club settles it outside; the record is the evidence and the link to the repair.
A buggy returned to the Buggy Station as **Damaged** gets its record written by the station together with the repair it opens; use this screen to record damage found later, to correct a record, and to see what is still open.
A record resolves when its repair is completed on Buggy Maintenance, or by hand when it has no repair.

## The screen at a glance

[Screenshot: Buggy Damages with an open record]

- **Open**, **Resolved** and **All** tabs; on Resolved and All a **Date from / to** range applies (from the first of the month, with no upper bound until you set one).
- The search box filters the loaded cards by buggy number, golfer, member number or description.
- One card per record: the buggy number and date, the cause, the golfer responsible, "recorded at the station" when the Buggy Station wrote it, the state of its repair, the description and remarks, and the resolved time.
  **Edit** is the visible action; an open record also has **Resolve** in its ⋮ menu.
- **Record damage** floats at the bottom right.

## Common tasks

### Record damage found in the depot

1. Click **Record damage**.
2. Pick the **Buggy** and the **Date**, choose **Caused by**, name the **Golfer responsible** and **Member No** when the cause is a player and they are known, and type the **Description**.
3. Leave **Open a repair and park the unit** ticked to raise the repair at once (a unit already under a job gets the record attached to that job), or untick it to keep the record only.
4. Click **Save**.

### Correct a record

- Click **Edit**, change the cause, the golfer, the description or the remarks, and click **Save**.
  The unit and the date are facts of the incident and cannot be changed.

### Resolve a record

- Open the ⋮ menu and click **Resolve**, then confirm.
  A record whose repair is still open resolves when that repair is completed on Buggy Maintenance.

## Field reference

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Buggy** | Yes | The damaged unit. | Any active unit; fixed once saved. |
| **Date** | Yes | When the damage happened. | Fixed once saved. |
| **Caused by** | Yes | Player, Staff, or Not caused by a person. | |
| **Golfer responsible** | No | The player's name. | Shown when the cause is a player; up to 255 characters. |
| **Member No** | No | The player's member number. | Up to 50 characters. |
| **Description** | Yes | What was damaged and how. | Up to 1000 characters. |
| **Remarks** | No | Anything else. | Up to 255 characters. |
| **Open a repair and park the unit** | No | Tick to raise the repair now. | New records only. |

## Tips & troubleshooting

- If you see "Complete the repair on B-012 first - it resolves the record.", the record follows its repair; complete it on Buggy Maintenance.
- If you see "Buggy B-012 is out on the course - return it first.", the repair cannot be opened while the unit is out; untick the repair box and open it later.
- A record written at the Buggy Station names the rider the desk picked; "Not named" means the desk left it open.
- Nothing here charges the golfer; agree and collect any compensation outside the system.

## Related options

- Golf Management → Front Desk → Buggy Station - a Damaged return records the incident and opens the repair.
- Golf Management → Buggy Management → Buggy Maintenance - the repair the record is attached to.
- Golf Management → Common Setup → Buggies - the fleet register.
