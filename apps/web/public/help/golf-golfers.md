# Golfers

> **Where:** Golf Management → Golfers
>
> **Who can use it:** users whose role includes the Golf Management module.
> The Edit button appears only when your role holds the Edit permission for this screen and the record is within your data scope.

## What this option is for

The Golfers screen lists every golfer identity the club knows - members who have booked and public (visitor) golfers who have registered at the front desk - and lets you maintain the two golf-owned facts about each of them: the **handicap index** and the **handicap status** (Established, Provisional or Beginner).
These two fields are what the Handicap Control rules on the Golf Specification screen read when they decide whether a player may book a flight, by what time, and whether a beginner or provisional player needs established companions.
Nothing else about the person is edited here: a member's name and member number come from the Membership system, and a visitor's profile is captured at the front desk; both are shown read-only.
Staff come here after a golfer submits a handicap card, when the club rates a new player, or to leave a note on a golfer's record.

## The screen at a glance

[Screenshot: Golfers list]

- A search box at the top filters the list as you type, matching the golfer's name or member number.
- Each golfer is a card showing the name as the title, the type (**Member** or **Public**) with the member number, then the **Handicap** (one decimal, or a dash when not recorded), the **Status** (Established / Provisional / Beginner / Not recorded) and any **Remarks**.
- A status chip at the top right shows **Active** or **Inactive**.
- Each card has an **Edit** button.
- There is no "New golfer" button: identities are created automatically by the Golf Booking screen (members, at their first booking) and the Tee Time Sheet (visitors, at their first registration).

## Common tasks

### Record or update a golfer's handicap

[Screenshot: Handicap dialog]

1. Type part of the golfer's name or member number in the search box and click **Edit** on the card.
2. The dialog shows the **Golfer** and **Type** for reference; they cannot be changed here.
3. Enter the **Handicap index** (e.g. `18.4`), or clear the box to mark the handicap as not recorded.
4. Pick the **Handicap status** that applies to this player, or leave it as **Not recorded**.
5. Add any **Remarks** the front desk should see.
6. Click **Save**.

The card updates at once, and the next booking or registration for this golfer is checked against the new values.

### Find a golfer

- Type part of the name or member number in the search box; the list narrows as you type.
- Use **Clear search** when nothing matches.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

## Field reference

### Handicap dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Golfer** | - | Shown, not entered: the golfer's name and member number as held by their source record. | Read-only. |
| **Type** | - | Shown, not entered: **Member** (profile held in Membership) or **Public** (visitor profile held by golf). | Read-only. |
| **Handicap index** | No | The player's current handicap index, e.g. `18.4`. A golfer with no index is treated as unrated and is exempt from the handicap limit rules. | 0.0 to 54.0, one decimal place. Leave blank for "not recorded". |
| **Handicap status** | No | **Established** (a settled handicap), **Provisional** (a new handicap still being confirmed) or **Beginner**. The accompaniment rules target Beginner and Provisional players and count Established players as valid companions; a golfer with no status is never targeted by those rules. | Pick one of the three, or **Not recorded**. |
| **Remarks** | No | A free note about the golfer, e.g. `Card verified 10 Oct 2026`. | Up to 2000 characters. |

## Tips & troubleshooting

- If you see "Handicap index must be between 0.0 and 54.0." correct the number; the box also refuses more than one decimal place.
- If you see "Pick a handicap status." the status sent was not one of the three choices; reopen the dialog and pick again.
- If you see "Your role's data scope does not allow amending this record." the golfer record belongs to another user's or department's scope; ask an administrator.
- If you see "Select a workspace first." pick your company at the top of the screen and try again.
- A member you expect to see is missing because they have never booked: the identity is created at their first booking, so make the booking first and then come back to key the handicap.
- Gender, used by the men's and ladies' handicap caps, is not stored here; it is read live from the member's profile or the visitor's front-desk record, so keep those up to date.
- The handicap rules only take effect while **Handicap control** is switched on in Golf Specification; the values you keep here are stored either way.

## Related options

- Golf Management → Golf Specification - the Handicap Control section: maximum handicap by course, day and holes, latest tee-off times, and the accompaniment rules that read these fields.
- Golf Management → Golf Booking - creates a member's golfer identity at their first booking and refuses a booking that breaks a handicap rule.
- Golf Management → Front Desk → Tee Time Sheet - creates a visitor's identity at registration and shows handicap warnings when registering a flight.
- Membership Management → Members - the source of a member's name, member number and gender.
