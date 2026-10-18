# Buggy Maintenance

> **Where:** Golf Management → Buggy Management → Buggy Maintenance
>
> **Who can use it:** users whose role includes the Golf Management module and this screen.
> New job and Inspect need the Create permission, Complete needs Edit, Cancel job needs Delete.

## What this option is for

Buggy Maintenance keeps the jobs done on the fleet: routine **services**, **repairs** and the safety **inspection**.
A unit under service or repair is **parked** - its location reads In maintenance on the Buggies screen and the Buggy Station cannot issue it - until the job is completed here, when it returns to the depot.
An inspection ticks the five systems of the unit (steering, brakes, electrical, drive, body) and is done on the spot: all clear closes it, a fault opens a repair and parks the unit.
A unit returned to the Buggy Station with a **fault** or **damage** gets its repair opened by the station itself, so the jobs you see here are not only the ones keyed on this screen.
Costs are the club's own note; nothing is billed from here.

## The screen at a glance

[Screenshot: Buggy Maintenance with open jobs]

- **Open**, **Done** and **All** tabs; **Kind** narrows to services, repairs or inspections; on Done and All an **Opened from / to** range applies (from the first of the month, with no upper bound until you set one).
- **Inspect…** opens the safety checklist for several units at once.
- The search box filters the loaded cards by buggy number, type, findings or work done.
- A count line: jobs listed and units parked in maintenance.
- One card per job: the buggy number and kind, when it was opened and how it was raised (keyed, at the Buggy Station, by an inspection), the faulty systems of an inspection or "all clear", the findings, and for a completed job the completion time, work done and cost.
  An open job shows **Complete**; a keyed job also has **Cancel job** in its ⋮ menu.
- **New job** floats at the bottom right.

## Common tasks

### Park a unit for service or repair

1. Click **New job**.
2. Pick the **Kind** - Service or Repair - and describe the **Work planned** or the **Fault found** (required for a repair).
3. Tick the **Buggies** (only units in the depot with no open job are offered; search by number or type).
4. Click **Open service on n buggies** (or **Open repair on n buggies**).
   The units move to In maintenance and the station cannot issue them.

The same job can be opened for one unit from the Buggies screen's ⋮ menu (**Open service**, **Open repair**).

### Run the safety inspection

1. Click **Inspect…**.
2. Tick each buggy inspected (**Tick all shown** covers the filtered list), and for each ticked unit untick any system found faulty - **Steering**, **Brakes**, **Electrical**, **Drive**, **Body** - and type the **Fault found**.
   Units out on the course are not offered; a unit already under a job can still be inspected, its fault is added to that job.
3. Click **Record n inspections**.
   The message says who passed, which units got a repair opened, and which were already in maintenance.

One unit can be inspected from the Buggies screen's ⋮ menu (**Inspect**).

### Complete a job

1. Click **Complete** on the open job.
2. Type the **Work done** and the **Cost** if the club notes it, then click **Complete job**.
   The unit returns to the depot unless another job still parks it; a damage record attached to the repair is resolved.

### Cancel a mis-keyed job

- Open the job's ⋮ menu and click **Cancel job**, then confirm.
  Only a keyed open job can be cancelled; a job raised at the Buggy Station or by an inspection is completed instead.

## Field reference

### New job

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Kind** | Yes | Service or Repair. | Both park the units. |
| **Work planned / Fault found** | For a repair | What the job is for. | Up to 1000 characters. |
| **Remarks** | No | Anything else. | Up to 255 characters. |
| **Buggies** | Yes | The units the job covers. | Active units in the depot with no open job. |

### Safety inspection

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Buggy** (tick box) | - | Tick the units inspected. | Units on the course are not offered. |
| **Steering / Brakes / Electrical / Drive / Body** | - | Untick a faulty system. | All ticked = all clear. |
| **Fault found** | When a system is unticked | What was found. | Up to 1000 characters; opens a repair. |
| **Remarks** | No | Kept on every inspection of the batch. | Up to 255 characters. |

### Complete job

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Work done** | No | What was done. | Up to 1000 characters. |
| **Cost** | No | The club's own cost note. | 0.00 or more; nothing is billed. |

## Tips & troubleshooting

- If you see "Buggy B-012 is out on the course - return it first.", the unit cannot be parked or inspected until the Buggy Station returns it.
- If you see "Buggy B-012 already has an open repair - complete it first.", one job at a time parks a unit; complete the open one.
- If you see "Describe the fault found on B-012 (Brakes).", an unticked system needs its finding.
- If you see "This repair was raised by the station - complete it instead.", a station or inspection job cannot be cancelled.
- The Buggies screen shows the open job under each parked unit; the Buggy Station shows In maintenance in its fleet counts and refuses the unit.

## Related options

- Golf Management → Buggy Management → Buggy Damages - the damage register; a damaged return at the station opens a repair here and a record there.
- Golf Management → Common Setup → Buggies - the fleet register with the units' live location.
- Golf Management → Front Desk → Buggy Station - where a fault or damaged return opens a repair by itself.
