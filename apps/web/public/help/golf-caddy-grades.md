# Caddy Grades

> **Where:** Golf Management → Common Setup → Caddy Grades
>
> **Who can use it:** users whose role includes the Golf Management module.
> The New, Edit, Enable/Disable and Delete controls appear only when your role holds the matching Create, Edit or Delete permission for this screen.

## What this option is for

The Caddy Grades screen maintains the club's caddy grades - for example Gold, Senior and Trainee.
Every caddy on the register holds one grade, and the grade's **Golfers per caddy** decides how many golfers one caddy of that grade serves at once: one for a single bag, two for a shared caddy.
What the golfer pays for a caddy stays on Transaction Type (the caddy fee items); what the club pays the caddy is settled outside the system, so there are no pay rates here.
Staff come here when the register is first set up and when the club introduces a new grade.

## The screen at a glance

[Screenshot: Caddy Grades list]

- A count line shows how many grades exist and how many are active.
- A search box filters the list as you type; it matches the code and the name.
- Each grade is a card: the code and name as the title, a chip with the golfers per caddy, and how many caddies hold the grade.
- A status chip at the top right shows **Active** or **Disabled**; active grades are listed first.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable** and **Delete**.
- The **New caddy grade** button floats at the bottom right of the screen.

## Common tasks

### Add a caddy grade

[Screenshot: New caddy grade dialog]

1. Click **New caddy grade**.
2. Enter the **Code** (e.g. `GOLD`); it is stored in capitals.
3. Enter **Golfers per caddy** - 1 for one bag, 2 when a caddy of this grade carries two golfers.
4. Enter the **Name** (e.g. `Gold caddy`) and set the **Sort Order** to place the grade in the pickers (lower first).
5. Click **Save**.

The grade is active at once and can be picked on the Caddies screen.

### Edit a caddy grade

1. Click **Edit** on the card and change what you need.
2. Click **Save**.

### Disable, enable or delete a caddy grade

- Open the card's ⋮ menu and click **Disable** to stop offering the grade for new caddy records; caddies who already hold it keep it.
- Click **Enable** to offer it again.
- Click **Delete** to remove a grade no caddy holds; the system refuses while any caddy record still names it.

## Field reference

### New / Edit caddy grade dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code, e.g. `GOLD` or `TRAINEE`. | Letters, digits and hyphens, up to 20 characters, stored in capitals; unique in your company. |
| **Golfers per caddy** | Yes | How many golfers one caddy of this grade serves at once. | Whole number from 1 to 4; new grades start at 1. |
| **Name** | Yes | The label shown on the register and the badges. | Up to 255 characters. |
| **Sort Order** | Yes | The position in the pickers; lower numbers first. | Whole number from 1 to 999; new grades start at 100. |

## Tips & troubleshooting

- If you see "Caddy grade 'X' already exists.", another grade in your company already uses that code.
- If you see "Caddy grade 'X' is held by 12 caddy record(s) - disable it instead.", caddies still hold the grade; disable it rather than deleting it.
- If you see "Your role's data scope does not allow amending this record.", the grade was created by someone outside your data scope.
- A caddy cannot be moved onto a disabled grade.

## Related options

- Golf Management → Common Setup → Caddies - the register, where every caddy holds a grade.
- Golf Management → Common Setup → Caddy Groups - the optional teams caddies belong to.
- Golf Management → Common Setup → Transaction Type - the single and shared caddy fee items the golfer pays.
