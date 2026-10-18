# Caddy Rounds

> **Where:** Golf Management → Front Desk → Caddy Rounds
>
> **Who can use it:** users whose role includes the Golf Management module and this screen.
> The screen is read-only; it needs no Create, Edit or Delete permission.

## What this option is for

The club pays its caddies outside the system, but every round of caddy service is recorded at the Caddy Station.
Caddy Rounds is the report the club settles that pay from: for a period you choose, one line per caddy with the rounds that count, the rounds that do not, how many were 9 and 18 holes, the holes and golfers served, and how many rounds the player asked for that caddy by name.
Under each caddy the individual rounds can be opened, and the whole report exports to a CSV file for the payroll or the caddy master.

A round **counts** when it was completed, or when the caddy was swapped out for a reason other than a complaint (caddy unwell or injured, player request, other).
A round ended by a **complaint against the caddy** is listed but not counted.
A round still on the course is shown apart and never counted until it is completed.

## The screen at a glance

[Screenshot: Caddy Rounds with the totals strip and two caddy cards]

- **Play date from** / **to** set the period; it starts on the first of the current month to today.
- **Caddy** narrows the report to one caddy (type the badge number or name; the list includes inactive caddies so past rounds stay reachable).
- **Export CSV** saves the report as a file named `caddy-rounds-<from>-to-<to>.csv`.
- The search box filters the loaded cards by badge number, name, grade or group.
- The **totals strip** sums the period: caddies, rounds, not counted, 9 / 18 holes, holes served, golfers served, rounds requested by name and, when any, rounds still on the course.
- One card per caddy: badge number and name, the grade and group, the counts (Rounds with the not-counted ones in brackets, 9 / 18, Holes, Golfers, By name), the caddy's status chip and a **Rounds** button that unfolds the detail.
- Each round in the detail shows the play date, tee time and course, the golfers served, then "completed · 18 of 18 holes", "swapped at hole 7 · caddy unwell or injured · 7 of 18 holes" or "on the course", with "not counted" on a complaint swap and "requested by name" when the player asked for the caddy.

## Common tasks

### Prepare the caddy pay for a period

1. Set **Play date from** and **to** to the pay period.
2. Read the totals strip, then check any caddy whose count looks off by clicking **Rounds** on the card.
3. Click **Export CSV** and hand the file to whoever settles the pay.
   The file holds the summary lines first (one per caddy plus a Total line), a blank line, then every round with its date, tee time, course, caddy, golfers, holes, holes played, status, whether it counts, whether it was requested by name, and the swap reason and hole.

### Check one caddy's rounds

1. Pick the caddy in the **Caddy** box (or type part of the badge number or name in the search box).
2. Click **Rounds** on the card to see each round; click **Hide rounds** to fold it again.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Play date from** | Yes | The first play date of the period. | Must not be after the to date. |
| **to** | Yes | The last play date of the period. | Inclusive. |
| **Caddy** | No | One caddy of the club. | Leave on All caddies for the whole register. |

### Columns per caddy

| Column | Meaning |
| --- | --- |
| **Rounds** | Rounds that count: completed, or swapped out for a reason other than a complaint. The not-counted ones follow in brackets. |
| **9 / 18** | How many counted rounds were 9-hole and 18-hole registrations. |
| **Holes** | The holes actually served over every closed round (completed holes, or the hole of the swap). |
| **Golfers** | The golfers served over every closed round (a shared slot counts two). |
| **By name** | Counted rounds where the player asked for this caddy, from a booking request or at the station. |
| **on the course** | Rounds still open; they join the counts once completed. |

## Tips & troubleshooting

- If you see "Pick the date range.", both dates are needed.
- If you see "The from date is after the to date.", swap the two dates.
- A caddy who was marked inactive or blacklisted during the period still appears with the rounds served, with a grey status chip.
- Rounds are recorded only at the Caddy Station; a caddy who went out without being assigned there has no round here.
- The export counts exactly what the screen shows for the period and caddy chosen; clear the Caddy box before exporting the whole club.

## Related options

- Golf Management → Front Desk → Caddy Station - where every round is assigned, completed or swapped.
- Golf Management → Common Setup → Caddies - the register and the caddy's notes (a complaint swap is often paired with a complaint note there).
- Golf Management → Common Setup → Caddy Grades - the golfers one caddy serves at once.
- Golf Management → Golf Booking and Front Desk → Tee Time Sheet - where a player asks for a caddy by name.
