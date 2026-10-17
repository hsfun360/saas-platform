# Caddy Groups

> **Where:** Golf Management → Common Setup → Caddy Groups
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New, Edit, Enable/Disable and Delete controls appear only when your role holds the matching Create, Edit or Delete permission for this screen.

## What this option is for

The Caddy Groups screen maintains optional teams of caddies - for example Team A under one leader - with a cap on the team's size and the order the teams take turns in.
Groups are optional: a caddy record may leave the group blank.
Staff come here when the club organises its caddies into teams for duty rotation.

## The screen at a glance

[Screenshot: Caddy Groups list]

- A count line shows how many groups exist and how many are active.
- A search box filters the list as you type; it matches the code and the name.
- Each group is a card: the code and name as the title, a chip with the rotation order, and how many caddies are in it against the cap.
- A status chip at the top right shows **Active** or **Disabled**.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable** and **Delete**.
- The **New caddy group** button floats at the bottom right of the screen.

## Common tasks

### Add a caddy group

[Screenshot: New caddy group dialog]

1. Click **New caddy group**.
2. Enter the **Code** (e.g. `TEAM-A`); it is stored in capitals.
3. Optionally enter **Max caddies** - leave it blank for no cap.
4. Enter the **Name** and the **Rotation Order** (lower numbers take their turn first).
5. Click **Save**.

### Edit, disable, enable or delete a group

- Click **Edit** to change the details; a cap cannot be set below the number of caddies already in the group.
- Open the ⋮ menu and click **Disable** to stop offering the group for new caddy records, or **Enable** to offer it again.
- Click **Delete** to remove an empty group; the system refuses while any caddy is still in it.

## Field reference

### New / Edit caddy group dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code, e.g. `TEAM-A`. | Letters, digits and hyphens, up to 20 characters, stored in capitals; unique in your company. |
| **Max caddies** | No | The most caddies the group may hold. | Whole number from 1 to 999, or blank for no cap; never below the current membership. |
| **Name** | Yes | The team's name. | Up to 255 characters. |
| **Rotation Order** | Yes | The order the groups take turns in. | Whole number from 1 to 999; new groups start at 100. |

## Tips & troubleshooting

- If you see "Caddy group 'X' already exists.", another group already uses that code.
- If you see "Caddy group 'X' already has 8 caddies - the cap cannot be below that.", raise the cap or move caddies out first.
- If you see "Caddy group 'X' still has 3 caddies - move them first or disable the group.", a group with members cannot be deleted.
- If you see "Caddy group 'X' is full (8).", the group has reached its cap; pick another group for the caddy or raise the cap.

## Related options

- Golf Management → Common Setup → Caddies - assign a caddy to a group and mark the group leader.
- Golf Management → Common Setup → Caddy Grades - the grade every caddy holds.
