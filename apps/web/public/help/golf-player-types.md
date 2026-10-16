# Player Types

> **Where:** Golf Management → Common Setup → Player Types
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New, Edit, Enable/Disable and Delete controls appear only when your role holds the matching Create, Edit or Delete permission for this screen.

## What this option is for

The Player Types screen maintains the club's catalog of player categories - who a player on a booking or a registration is, for pricing and for the rules.
The code of a player type is what the Transaction Type rate card prices by (the "default for" category on a green fee, buggy or caddy item) and what every booking line, roster line and registration carries.
Every player type behaves as one **base identity**, which decides the rules the system applies: a member of this club, a member playing as another member's guest, a visitor, or a member of an affiliated or reciprocal club.
Three types are built in and present in every club - **member**, **member-guest** and **guest** - and cannot be removed or switched off.
Staff come here when the club starts taking a new category of player, such as the members of a golf association it is affiliated to, the members of a reciprocal club, or a hotel guest rate.

## The screen at a glance

[Screenshot: Player Types list]

- A count line shows how many player types exist and how many are active.
- A search box filters the list as you type; it matches the code, the description and the base identity.
- Each player type is a card: the code and description as the title, a chip with the base identity, and the notes "System type - code fixed" and "Bookings need approval" where they apply.
- A status chip at the top right shows **Active** or **Disabled**; system types are listed first, then active types, then disabled ones.
- Each card has an **Edit** button; a club-defined type also has a ⋮ menu holding **Enable** or **Disable** and **Delete**.
- The **New player type** button floats at the bottom right of the screen.

## Common tasks

### Add a player type

[Screenshot: New player type dialog]

1. Click **New player type**.
2. Enter the **Code** (e.g. `MGA`); it is stored in capitals.
3. Pick the **Base Identity**; a hint under the field states what that choice means for the player (which rules apply, whether they may book or walk in).
4. Enter the **Description** (e.g. `MGA affiliate`) - the label the pickers, the tee sheet and the emails show.
5. Set the **Sort Order** to place the type in the pickers (lower first) and tick **Bookings with a player of this type need approval** if a booking carrying this type must be approved before it stands.
6. Click **Save**.

The type is active at once.
To price it, create a green-fee Transaction Type whose "default for" names the new code; buggy and caddy items can carry the code the same way.

### Edit a player type

1. Click **Edit** on the card and change what you need.
2. Click **Save**.

On a system type only the description, the approval switch and the sort order can change; the code and base identity are fixed because the rate card and every line already carry them.
On a club-defined type the code and base identity can change only while nothing uses the type yet.

### Disable, enable or delete a player type

- Open the card's ⋮ menu and click **Disable** to stop offering the type on new bookings and registrations; it stays on this screen for history and on the lines that already carry it.
- Click **Enable** to offer it again.
- Click **Delete** to remove a club-defined type that nothing has used yet; the confirmation states what happens, and the system refuses while a booking line, roster line or transaction type still uses the code.

## Field reference

### New / Edit player type dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code, e.g. `MGA` or `RECIP`. | Letters, digits and hyphens, up to 20 characters, stored in capitals; unique in your company; fixed on a system type and on a type already in use. |
| **Base Identity** | Yes | **Member** - a member of this club (standing, golfing right, booking limit, junior and handicap checks; books in advance). **Member as Guest** - a member under another member's booking (member standing, the guest-control switch for members as guests, the booker's guest quota). **Guest / Visitor** - no standing (guest control, the booker's guest quota; may walk in). **Affiliated / Reciprocal** - a member of an affiliated or reciprocal club, who enters only through a confirmed Affiliated Visit and counts as a guest for guest control and quota. | Pick one of the fixed choices; fixed on a system type and on a type already in use. |
| **Description** | Yes | The label shown everywhere for this type. | Up to 255 characters. |
| **Sort Order** | Yes | The position in the pickers; lower numbers first. | Whole number from 1 to 999; new types start at 100. |
| **Bookings with a player of this type need approval** | No | Tick to hold a booking carrying this type pending approval through the Workflow engine (purpose Golf flight booking). | With no approval chain configured the booking approves at once. |

## Tips & troubleshooting

- If you see "Player type 'X' already exists.", another type in your company already uses that code.
- If you see "Code may only contain letters, digits and hyphens.", remove spaces and other characters from the code.
- If you see "Player type 'X' is used by 12 player line(s), 2 transaction type(s) - its code cannot change." (or "- its base identity cannot change" / "- disable it instead"), the type is already on records; keep the code, or disable the type rather than deleting it.
- If you see "'member' is a system player type and stays active." or "... cannot be deleted.", the three built-in types are permanent.
- If you see "Your role's data scope does not allow amending this record.", the type was created by someone outside your data scope.
- A player type with the Affiliated / Reciprocal base never appears in the booking screen's player picker or the walk-in forms; its players arrive through a confirmed Affiliated Visit with a letter of introduction.
- The three built-in codes are the categories the rate cards were priced for before this screen existed, so existing prices and bookings keep working unchanged.

## Related options

- Golf Management → Transaction Type - the "default for" category on a green fee, buggy or caddy item names a player type code.
- Golf Management → Golf Booking and Front Desk → Tee Time Sheet - the player type picked on every line and walk-in.
- Golf Management → Group Bookings - the roster lines carry a player type.
- Golf Management → Golf Specification - guest control and the guest quota act on the guest, member-as-guest and affiliate bases.
