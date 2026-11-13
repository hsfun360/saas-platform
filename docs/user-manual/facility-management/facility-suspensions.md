# Booking Suspensions

> **Where:** Facility Management → Booking Suspensions
>
> **Who can use it:** users whose role includes the Facility Management module.
> The New suspension button needs the Create permission; the Lift button needs the Edit permission, and the suspension must be within your data scope.

## What this option is for

The Booking Suspensions screen lists the members who are barred from booking facilities for a period, and why.
A suspension starts in one of two ways: automatically, when a member's no-shows reach the strike count set in Facility Specification, or by hand, when the office keys one in here.
While a suspension is active, the Facility Bookings screen refuses any booking that falls inside its dates and has the member as the booker or as a member participant.
Staff come here to see who is suspended and for how long, to suspend a member for another reason, and to lift a suspension early.
A suspension stops bookings only; entry to a facility and the handing out of Utility Items at the Control Station are not affected.

## The screen at a glance

[Screenshot: Booking Suspensions list on the Active filter]

- Four buttons filter the list by status: **Active** (where the screen starts), **Lifted**, **Expired** and **All**.
- A search box filters the listed suspensions as you type, matching the member's name, the member number and the reason.
- Each suspension is a card: the member's name and member number as the title; then the first and last day of the suspension and the facility type it covers, or "every facility type"; then the **Reason**, the number of **Strikes** behind an automatic suspension, and, on a lifted one, **Lifted** with the reason and time.
- A status chip at the top right shows **Active** (red), **Lifted** or **Expired** (grey).
  A suspension turns Expired by itself once its last day has passed.
- An active card shows a **Lift** button.
- The **New suspension** button floats at the bottom right of the screen.
- With nothing to show, the screen reads, for example, "No active suspensions. One starts automatically when a member reaches the strike count on a type with strikes on, or use 'New suspension'."

## Common tasks

### Suspend a member by hand

[Screenshot: New suspension drawer]

1. Click **New suspension**.
2. Key in the **Member number**.
3. Leave **Facility type** on **Every facility type** to bar the member from booking anything, or pick one facility type to bar bookings of that type only.
4. Check the **First day** (it starts on today) and pick the **Last day**.
5. Enter the **Reason**.
6. Read the note under the form: "The member is barred from booking inside the dates; entry and issue at the Control Station are unaffected. The member is emailed."
7. Click **Suspend**, or **Cancel** to back out.

The message reads, for example, "Ahmad Faizal suspended from booking until 30 Nov 2026.".
The list switches to the **Active** filter with the new suspension highlighted, and the member is emailed when an email address is on their member record.
A member can have only one active suspension at a time.
If you leave the drawer after typing, the system asks whether to discard your changes or keep editing.

### Lift a suspension early

[Screenshot: Lift the suspension drawer]

1. On the **Active** filter, find the member (use the search box if the list is long) and click **Lift**.
2. The drawer names the member in its title and shows the dates and the reason of the suspension.
3. Enter the **Reason** for lifting it; this is required.
4. Click **Lift suspension**, or **Cancel** to back out.

The message reads "Ahmad Faizal's suspension lifted.".
The card moves to the **Lifted** filter and keeps the reason and time, and the member can book again at once.
A lifted or expired suspension cannot be brought back; key in a new one if needed.

### How an automatic suspension starts

You do nothing on this screen for an automatic suspension; it appears here by itself.

- A no-show recorded at the Control Station counts as a strike when the Facility Type is set to count no-shows as strikes.
- When a booker's strikes inside the period set in Facility Specification (**Within (days)**) reach **No-shows to suspend**, the system suspends the member from the day of the last strike for the number of days in **Suspension (days)**.
- The suspension covers every facility type, its reason reads, for example, "Automatic - 3 no-shows in 90 days", and the card shows the number of strikes behind it.
- The member is emailed when an email address is on their member record.
- No new suspension starts while the member already has an active one.

### Review past suspensions

- Click **Lifted** or **Expired** to see suspensions that have ended, or **All** to see everything.
- Type a name, a member number or part of a reason in the search box to narrow the list; use **Clear search** when nothing matches.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| Status buttons | No | **Active**, **Lifted**, **Expired** or **All**. | Starts on Active; up to 500 suspensions are listed. |
| **Search** | No | Any part of the member's name, the member number or the reason. | Filters the suspensions already listed under the chosen status. |

### New suspension drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Member number** | Yes | The member to suspend, e.g. `A0018`. | Up to 50 characters; must be an existing member with no active suspension. |
| **Facility type** | No | Leave on **Every facility type**, or pick one type to limit the suspension to bookings of that type. Type to filter the list. | The list holds the active facility types. |
| **First day** | Yes | The first day on which bookings are refused; pick from the calendar. | Starts on today. |
| **Last day** | Yes | The last day on which bookings are refused; pick from the calendar. | Must not be before the first day. |
| **Reason** | Yes | Why the member is suspended, e.g. `Damage to court equipment`; it is shown on the card. | Up to 255 characters. |

### Lift the suspension drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes | Why the suspension is lifted early, e.g. `Committee appeal upheld`. | Up to 255 characters; kept on the card. |

## Tips & troubleshooting

- If you see "No member found with number 'X'." check the member number.
- If you see "Ahmad Faizal is already suspended until 30 Nov 2026 - lift it first." the member has an active suspension; lift it before keying in a new one with different dates.
- If you see "The last day must not be before the first day." or "Give the first and the last day of the suspension." correct the two dates.
- If you see "Key in the member number.", "Pick the last day." or "Give the reason." a required box is empty.
- If you see "Give the reason for lifting." or "Give the reason for lifting the suspension." the Reason box in the lift drawer is empty.
- If you see "This suspension is lifted." or "This suspension is expired." it has already ended; pick the status filter again to reload the list.
- If you see "You are not allowed to amend this suspension." the suspension lies outside your role's data scope.
- A suspension is checked against the date of the booking, not the day the booking is made: a member suspended until 30 November cannot book a slot on 29 November but can book one on 1 December.
- On the Facility Bookings screen a suspended member is caught as soon as you click **Check**, with a line such as "Ahmad Faizal is suspended from booking until 30 Nov 2026 - Automatic - 3 no-shows in 90 days."
- Bookings the member already holds are not cancelled by a suspension; cancel them on the Facility Bookings screen if the club wants that.
- To forgive a single no-show before it leads to a suspension, waive its charge on the No-show Charges screen and tick the option to clear the strike.
- Only members can be suspended here, because the drawer takes a member number.

## Related options

- Facility Management → Facility Specification - the Cancellation and No-show card: **No-shows to suspend**, **Within (days)** and **Suspension (days)**.
- Facility Management → Facility Types - the switch that makes no-shows on a type count as strikes.
- Facility Management → No-show Charges - the no-show charges behind the strikes, and where a strike is cleared.
- Facility Management → Control Station - where no-shows are recorded.
- Facility Management → Facility Bookings - where a suspended member's booking is refused.
