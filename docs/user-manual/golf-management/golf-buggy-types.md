# Buggy Types

> **Where:** Golf Management → Common Setup → Buggy Types
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New, Edit, Enable/Disable and Delete controls appear only when your role holds the matching Create, Edit or Delete permission for this screen.

## What this option is for

The Buggy Types screen maintains the kinds of buggy the club runs - a two-seater, a four-seater, a VIP buggy.
Every unit in the fleet (the Buggies screen) names its type, and the type's **Seats** decides how many riders the Buggy Station may put on one unit.
The buggy fee is not set here: it is priced by golfer type and usage type (single or shared buggy) under Transaction Type.
Staff come here once when the fleet is first registered, and again when the club buys a new kind of buggy.

## The screen at a glance

[Screenshot: Buggy Types list]

- A count line shows how many buggy types exist and how many are active.
- A search box filters the list as you type; it matches the code and the name.
- Each buggy type is a card: the code and name as the title, a chip with the number of seats, and how many buggy records use the type.
- A status chip at the top right shows **Active** or **Disabled**; active types are listed first.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable** and **Delete**.
- The **New buggy type** button floats at the bottom right of the screen.

## Common tasks

### Add a buggy type

[Screenshot: New buggy type dialog]

1. Click **New buggy type**.
2. Enter the **Code** (e.g. `2SEAT`); it is stored in capitals.
3. Enter the **Seats** - the riders one unit carries (two for the usual buggy).
4. Enter the **Name** (e.g. `Two-seater electric`) and set the **Sort Order** to place the type in the pickers (lower first).
5. Click **Save**.

The type is active at once and can be picked on the Buggies screen.

### Edit a buggy type

1. Click **Edit** on the card and change what you need.
2. Click **Save**.

Changing the seats takes effect on the next issue at the Buggy Station; units already out are unaffected.

### Disable, enable or delete a buggy type

- Open the card's ⋮ menu and click **Disable** to stop offering the type for new buggy records; existing units keep it.
- Click **Enable** to offer it again.
- Click **Delete** to remove a type no buggy record uses; the confirmation states what happens, and the system refuses while any buggy record still names the type.

## Field reference

### New / Edit buggy type dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code, e.g. `2SEAT` or `VIP`. | Letters, digits and hyphens, up to 20 characters, stored in capitals; unique in your company. |
| **Seats** | Yes | How many riders one unit of this type carries. | Whole number from 1 to 6; new types start at 2. |
| **Name** | Yes | The label shown on the fleet register and the station. | Up to 255 characters. |
| **Sort Order** | Yes | The position in the pickers; lower numbers first. | Whole number from 1 to 999; new types start at 100. |

## Tips & troubleshooting

- If you see "Buggy type 'X' already exists.", another type in your company already uses that code.
- If you see "Code may only contain letters, digits and hyphens.", remove spaces and other characters from the code.
- If you see "Buggy type 'X' is used by 12 buggy record(s) - disable it instead.", units still name the type; disable it rather than deleting it.
- If you see "Your role's data scope does not allow amending this record.", the type was created by someone outside your data scope.
- A disabled type cannot be picked for a new buggy record, and a unit cannot be moved onto a disabled type.

## Related options

- Golf Management → Common Setup → Buggies - the fleet register, where every unit names its type.
- Golf Management → Front Desk → Buggy Station - issues one unit per buggy slot, never more riders than the type's seats.
- Golf Management → Common Setup → Transaction Type - the single and shared buggy fee items the station works from.
