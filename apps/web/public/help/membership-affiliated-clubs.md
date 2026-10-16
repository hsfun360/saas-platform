# Affiliated Clubs

> **Where:** Membership Management → Common Setup → Affiliated Clubs
>
> **Who can use it:** users whose role includes the Membership Management module.
> The New, Edit, Enable/Disable and Delete controls appear only when your role holds the matching Create, Edit or Delete permission for this screen.

## What this option is for

Reciprocal and affiliate arrangements are contracts between clubs, and the Membership Department governs them: which partner clubs exist, what each agreement allows, how many visits it admits, and the paperwork (the letter of introduction) in both directions.
The Affiliated Clubs screen keeps that list, together with the terms of each arrangement.
A member of such a club never books or walks in like an ordinary guest: their home club sends a letter of introduction, the membership office records the visit, confirms it and books the golf, and the front desk checks the letter on arrival.
The club record is where the terms live: which golf player type the visitors are billed as (and so which green-fee rate card applies), when the agreement runs, whether a visitor's charges may be signed back to the home club, how many guests a visitor may bring, how many visits one member may make in a period, the club-wide annual quota, the visit fee the host collects, and whether visits need approval.
Staff come here when the club signs a new arrangement, when its terms change, and when it lapses.

## The screen at a glance

[Screenshot: Affiliated Clubs list]

- A count line shows how many clubs exist and how many are active.
- A search box filters the list as you type; it matches the code, the name, the kind, the player type code and the contact person.
- Each club is a card: the code and name as the title; a chip with the kind (**Affiliated association** or **Reciprocal club**), the player type its visitors are billed as and the contact; then a **Terms** line that restates the arrangement in words (agreement dates, the per-member visit cap, the club-wide annual quota, the guest cap, the visit fee, whether charges may be signed back, whether visits need approval) and the address.
- A status chip at the top right shows **Active** or **Disabled**; active clubs are listed first.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable** and **Delete**.
- The **New affiliated club** button floats at the bottom right of the screen.

## Common tasks

### Add an affiliated or reciprocal club

[Screenshot: New affiliated club drawer]

1. On Golf Management → Player Types, make sure an **Affiliated / Reciprocal** base player type exists for this club's visitors, and give it a green-fee rate card on Transaction Type; if the host collects a visit fee, create a flat-priced miscellaneous golf transaction type for it.
2. Click **New affiliated club**.
3. Under **Club**, enter the **Code** (e.g. `MGA`), pick the **Kind**, enter the **Name** and pick the player type under **Billed as player type**.
4. Under **Terms of the arrangement**, set the **Agreement from** / **to** dates (leave both blank for an open-ended arrangement), the **Visits per player** and the period it is **Counted** over (e.g. 14 per year), the **Inbound visits per year (club-wide)** quota, the **Visit fee item**, the **Guests per visit** (0 = none, blank = no cap), and tick **Charges may be signed back to the home club** or **Visits from this club need approval** where the arrangement says so.
5. Under **Contact and address**, enter the office contact (their visits' confirmations and declines, and our letters of introduction, are emailed to the contact email) and the postal address.
6. Click **Save**.

### Edit a club

1. Find the club (use the search box if the list is long) and click **Edit**.
2. Change what you need and click **Save**.

Changing the terms affects visit requests recorded from then on; visits already confirmed are not touched.
If you leave the drawer with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable, enable or delete a club

- Open the card's ⋮ menu and click **Disable** when an arrangement lapses; the club stays on this screen for history and its members can no longer be recorded for a visit.
- Click **Enable** to bring it back.
- Click **Delete** to remove a club with no visit on record; the confirmation states what happens, and the system refuses once visits exist.

## Field reference

### New / Edit affiliated club drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Code** | Yes | A short code, e.g. `MGA` or `SAUJANA`. | Letters, digits and hyphens, up to 20 characters, stored in capitals; unique in your company. |
| **Kind** | Yes | **Affiliated association** (its members hold the association's card) or **Reciprocal club** (mutual visiting rights). | The terms below apply to both. |
| **Name** | Yes | The full name of the association or club. | Up to 255 characters. |
| **Billed as player type** | Yes | The golf player type of base Affiliated / Reciprocal whose green-fee rate card prices this club's visitors. | Must be an active affiliate-base player type. |
| **Agreement from** / **to** | No | The validity of the arrangement. | Both blank = open-ended; the end cannot precede the start; visits outside the dates are refused. |
| **Visits per player** / **Counted** | No | How many visits one member may make per week, month or year, in either direction. | 1 to 999; blank = no cap; the period is required when a number is given. |
| **Inbound visits per year (club-wide)** | No | The partnership's annual quota: visits from this club the arrangement admits in a calendar year, all members together. | 1 to 9999; blank = no cap. |
| **Visit fee item** | No | The flat-priced miscellaneous golf transaction type the host charges each visiting member. | Charged on the visiting member's golf bill at registration, never on their guests; blank = no fee. |
| **Guests per visit** | No | How many guests a visiting member may bring on one visit. | 0 to 99; blank = no cap. |
| **Sort Order** | Yes | The position in the pickers; lower numbers first. | Whole number from 1 to 999; new clubs start at 100. |
| **Charges may be signed back to the home club** | No | Tick when the arrangement lets a visitor charge their bill to the home club. | Unticked, the member and debtor payment classes are refused on a visitor's bill. |
| **Visits from this club need approval** | No | Tick to hold every visit request from this club pending approval through the Workflow engine. | With no chain configured the request approves at once. |
| **Contact person**, **Contact email**, **Contact phone** | No | The home club's office contact. | A valid email address; the phone takes a country code and number. |
| **Address**, **City**, **State**, **Postcode**, **Country** | No | The club's postal address. | Country is picked from the list. |
| **Remarks** | No | Blackout dates, dress code, anything the desk should know. | Up to 255 characters. |

## Tips & troubleshooting

- If you see "Affiliated club 'X' already exists.", another club in your company already uses that code.
- If you see "Pick the player type this club's visitors are billed as." or "'GUEST' is not an affiliated / reciprocal player type.", create or pick a player type with the Affiliated / Reciprocal base on Player Types first.
- If you see "Player type 'X' is disabled - enable it or pick another.", the chosen type is switched off.
- If you see "The agreement cannot end before it starts.", swap or correct the dates.
- If you see "Pick the period the visit cap counts over.", choose per week, month or year next to the visit number.
- If you see "Affiliated club 'X' has 3 visit(s) on record - disable it instead.", the club already has visits in history; disable rather than delete.
- If you see "The visit fee must be one of this company's miscellaneous golf transaction types.", create the fee as a miscellaneous item on Golf Management → Transaction Type first.
- If you see "Your role's data scope does not allow amending this record.", the club was created by someone outside your data scope.
- Blackout dates and weekend restrictions for a club's visitors are set as playing-right rules on Golf Specification once that section is in place; until then record them under Remarks so the office sees them when a visit is requested.

## Related options

- Membership Management → Affiliated Visits - where letters of introduction are recorded, confirmed and issued.
- Golf Management → Common Setup → Player Types - the Affiliated / Reciprocal base type each club is billed as.
- Golf Management → Transaction Type - the green-fee rate card for that player type and the visit fee item.
- Golf Management → Golf Specification - playing rights and round quotas may target a club (blackout days, time bands, courses).
