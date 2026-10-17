# Caddies

> **Where:** Golf Management → Common Setup → Caddies
>
> **Who can use it:** users whose role includes the Golf Management module.
> New, Edit, the status changes, New QR code and Delete appear only when your role holds the matching Create, Edit or Delete permission for this screen; Leave, Notes and Print badge are open to everyone with the screen.

## What this option is for

The Caddies screen is the club's caddy register: one record per caddy with the badge number, grade, optional group and leader flag, identity and contact details, nationality, race and languages, a photo, and the QR code printed on the badge.
Each caddy's record also holds their **leave** (annual, sick, injury, unpaid, other) and the **notes** on their service - commendations, complaints, penalties and evaluations, each with points - so the grade review has a history.
A caddy who leaves is marked **Inactive**; one the club will not use again is **Blacklisted**, which keeps the record so the badge number is never reissued.
Caddies are not system users and do not log in.

## The screen at a glance

[Screenshot: Caddies register board and list]

- Five tiles at the top show the counts - **All caddies**, **Available today**, **On leave today**, **Inactive** and **Blacklisted** - and clicking a tile filters the list.
- A search box filters as you type; it matches the badge number, name, grade, group, staff number and mobile.
- **Print badges** beside the search prints the badge sheet for every active caddy.
- Each caddy is a card: the photo, the badge number and name as the title, chips for the grade, the group (with "leader" where it applies) and today's leave, then the mobile, languages and the notes count with the points total.
- A status chip at the top right reads **Active**, **Inactive** or **Blacklisted**; an inactive or blacklisted card shows the reason.
- Each card has an **Edit** button and a ⋮ menu holding **Leave**, **Notes**, **Print badge**, **New QR code**, **Mark inactive** or **Reinstate**, **Blacklist** and **Delete**.
- The **New caddy** button floats at the bottom right of the screen.

## Common tasks

### Register a caddy

[Screenshot: New caddy drawer]

1. Click **New caddy**.
2. Under **Identity** enter the **Caddy No** (the badge number, e.g. `C-012`) and the **Name**, pick the **Caddy Grade** and, if the club uses teams, the **Caddy Group**; tick **Group leader** where it applies; add the **Staff No** and **Identity No** if known.
3. Under **Personal & contact** pick the **Gender**, enter the **Date of Birth**, **Mobile** (pick the country code, then type the number) and **Email**, pick the **Nationality** and **Race** from the club's lists, and list the **Languages** the caddy speaks.
4. Under **Employment & photo** enter the **Joined Date**, click **Upload photo** for the badge picture, and add any **Remarks**.
5. Click **Save**.

The caddy joins the active register with a QR code of their own.

### Print the badges

1. Click **Print badges** above the list for every active caddy, or open a card's ⋮ menu and click **Print badge** for one.
2. The badge sheet opens in a new tab; click **Print** there.
   Each badge carries the photo, the badge number, the name, the grade, the club name and the QR code.

### Record leave

[Screenshot: Leave view]

1. Open the card's ⋮ menu and click **Leave**.
2. Pick the **Leave Type**, enter **From** and **To** (the same date for one day) and optional **Remarks**, then click **Add leave**.
3. Existing records list below with **Edit** and **Remove**.

Leave dates of one caddy never overlap; a caddy on leave is counted under "On leave today" and is not assigned on those dates.

### Add a note

[Screenshot: Notes view]

1. Open the card's ⋮ menu and click **Notes**.
2. Pick the **Kind** (Commendation, Complaint, Penalty or Evaluation), the **Date**, the **Points** (positive for praise, negative for a complaint or penalty), a **Description** and any **Follow-up**, then click **Add note**.
3. The list shows every note newest first with the running points total; **Edit** and **Remove** are beside each.

### Replace a lost badge

1. Open the card's ⋮ menu and click **New QR code**, then confirm; the old badge stops working at once.
2. Click **Print badge** and hand over the new badge.

### Mark a caddy inactive, blacklist or reinstate

- **Mark inactive** (with a reason) when a caddy leaves; today becomes the left date unless one is set.
- **Blacklist** (with a reason) when the club will not use the caddy again; the badge number is never reissued.
- **Reinstate** brings an inactive or blacklisted caddy back to the active register and clears the left date.
- **Delete** removes a mis-keyed record only while it has no leave or note; otherwise mark it inactive.

## Field reference

### New / Edit caddy drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Caddy No** | Yes | The badge number, e.g. `C-012`. | Letters, digits and hyphens, up to 20 characters, stored in capitals; unique in the register. |
| **Name** | Yes | The caddy's name as printed on the badge. | Up to 255 characters. |
| **Caddy Grade** | Yes | The grade, from Caddy Grades. | An active grade of your company. |
| **Caddy Group** | No | The team, from Caddy Groups. | An active group with room under its cap, or None. |
| **Group leader** | No | Tick for the team's leader. | |
| **Staff No** | No | The company-wide staff number. | Up to 50 characters. |
| **Identity No** | No | NRIC or passport number. | Up to 50 characters. |
| **Gender** | No | Male or Female. | |
| **Date of Birth** | No | Pick from the calendar. | |
| **Mobile** | No | Country code plus number. | |
| **Email** | No | A contact address. | A valid email address. |
| **Nationality** | No | From the club's Nationalities list. | |
| **Race** | No | From the club's Races list. | |
| **Languages** | No | The languages the caddy speaks, e.g. `Malay, English`. | Up to 255 characters. |
| **Joined Date** / **Left Date** | No | Employment dates. | The left date cannot be before the joined date. |
| **Photo** | No | The badge picture. | Image file up to 2 MB; upload, replace or remove; kept when you click Save. |
| **Remarks** | No | Anything the desk should know. | Up to 255 characters. |

### Leave view

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Leave Type** | Yes | Annual leave, Sick leave, Injury, Unpaid leave or Other. | |
| **From** / **To** | Yes | The first and last day of the absence. | To is not before From; ranges of one caddy never overlap. |
| **Remarks** | No | Why or where. | Up to 255 characters. |

### Notes view

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Kind** | Yes | Commendation, Complaint, Penalty or Evaluation. | |
| **Date** | Yes | When it happened; today by default. | |
| **Points** | No | Signed points for the grade review. | Whole number from -100 to 100; 0 allowed. |
| **Description** | Yes | What happened. | Up to 255 characters. |
| **Follow-up** | No | What was done about it. | Up to 255 characters. |

### Status dialogs

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes for Mark inactive and Blacklist | Why the status changes. | Up to 255 characters; reinstatement needs none. |

## Tips & troubleshooting

- If you see "Caddy C-012 already exists (blacklisted - the number is not reissued).", pick a new badge number; a blacklisted record keeps its number for good.
- If you see "Caddy grade 'X' is disabled - pick an active grade." or "Caddy group 'X' is full (8).", choose another grade or group.
- If you see "Caddy C-012 already has sick leave from 2026-10-20 to 2026-10-21.", the new dates overlap an existing record; edit that record instead.
- If you see "Caddy C-012 has records (2 leave, 5 note(s)) - mark the caddy inactive instead.", a record with history cannot be deleted.
- If you see "Give the reason for marking the caddy inactive.", the reason is required for inactive and blacklisted.
- Printing opens a new browser tab; allow pop-ups for the app if nothing appears.

## Related options

- Golf Management → Front Desk → Caddy Station - checks the caddies in, assigns them to flights and records their rounds; a caddy on leave cannot check in.
- Golf Management → Common Setup → Caddy Grades and Caddy Groups - the grade every caddy holds and the optional teams.
- Golf Management → Common Setup → Transaction Type - the single and shared caddy fee items the golfer pays.
- SaaS Administration → Nationalities and Races - the lists the profile picks from.
