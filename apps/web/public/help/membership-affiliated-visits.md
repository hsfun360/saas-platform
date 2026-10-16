# Affiliated Visits

> **Where:** Membership Management → Affiliated Visits
>
> **Who can use it:** users whose role includes the Membership Management module and holds this menu.
> The New, Confirm, Issue letter, Edit, Decline, Cancel and Complete controls appear only when your role holds the matching Create or Edit permission for this screen.

## What this option is for

A member of an affiliated association or a reciprocal club does not book or walk in like a guest.
The home club's membership office issues a letter of introduction naming the member, the date and the facilities they wish to use, and the host club confirms the visit before they arrive.
The Affiliated Visits screen is the Membership Department's desk for that paperwork in both directions:

- **Inbound** - a partner club's member visits us: record the incoming letter, check it against the club's arrangement, confirm it (which books the golf flight under the visitor's own identity and emails the visitor and the home club), or decline it with a reason.
  On the day, the Tee Time Sheet receives the visitor (letter and ID sighted) before their party can register, and the visit completes once every bill is settled.
- **Outbound** - one of our members visits a partner club: record the request, and **Issue letter** checks the member is in good standing, numbers our letter of introduction and emails it to the partner's contact and to the member.

A visit from a club or a player type that needs approval is routed through the Workflow engine when you confirm it.

## The screen at a glance

[Screenshot: Affiliated Visits list]

- Two date fields filter by **Visit date from** / **to**; the range starts 7 days back and reaches 60 days ahead, because letters arrive well before the visit.
- A **Direction** filter shows both, inbound only or outbound only; a **Status** filter narrows the list to one state: **Requested**, **Pending approval**, **Confirmed**, **Letter issued**, **Declined**, **Arrived**, **Completed**, **Cancelled** or **Expired**.
- A search box filters the loaded list as you type, matching the visit number, the visitor, their member number, the club, the booking number and the letter reference.
- A count line reads e.g. "5 visits · 2 awaiting a decision · 4 open".
- Each visit is a card: the visit number, the person and the club as the title (inbound: the visitor and their home club and number; outbound: our member and the club to visit); an Inbound or Outbound chip, the date (and alternate date), the facilities requested and the golf party on the subline; then the letter reference with a link to the uploaded letter (inbound), when our letter was issued and to whom it was sent (outbound), the booking number once confirmed, and the decline or cancel reason, the arrival and the completion time where they apply.
- The status chip sits top-right: Requested and Pending approval (blue), Confirmed, Letter issued, Arrived and Completed (green), Declined, Cancelled and Expired (grey).
- A requested inbound visit shows **Confirm…**, a requested outbound one **Issue letter…**; an arrived or issued visit shows **Complete**; the ⋮ menu holds **Edit** (requested only), **Decline** (inbound, requested or pending approval) and **Cancel visit**.
- The **New visit** button floats at the bottom right of the screen.

## Common tasks

### Record an incoming letter of introduction (inbound)

[Screenshot: New visit drawer]

1. Click **New visit** and leave **Inbound** selected.
2. Under **Letter of introduction**, pick the **Home club**; its terms appear under the field (agreement dates, visits per member, the annual quota, guests, approval, settlement).
   Enter the **Letter reference** and click **Upload letter** to attach the PDF or image.
3. Under **Visiting member**, enter the **Name** and **Home club member no** as the letter states them, and the identity number, mobile and email when the letter gives them.
4. Under **Visit**, pick the **Visit date** (and an **Alternate date** if the letter offers one).
   Leave **Golf requested** ticked and pick the **Course**, the **Preferred tee time**, the **Holes**, the number of **Players** (the visitor included) and how many **Of which guests**; untick it for a visit without golf.
   Note any **Dining**, **Accommodation**, **Sports facilities** or **Other facilities** requested, and remarks for the desk.
5. Click **Save**.

The system checks the request against the arrangement before saving: the agreement must be in force on the visit date, the guests may not exceed the club's cap, the member may not exceed the club's visits per week, month or year, and the club may not exceed its annual inbound quota (the messages state the counts).
The visit is numbered from the Visit / Letter No. series and listed as **Requested**.

### Issue a letter of introduction for our member (outbound)

[Screenshot: Issue letter dialog]

1. Click **New visit** and select **Outbound**.
2. Pick the **Club to visit** and enter our member's **Member No**; the name and email come from the member record.
3. Pick the **Visit date** (and an **Alternate date**), state the golf the member wants (holes, preferred time, party and guests) and any dining, accommodation, sports or other facilities, then click **Save**.
4. Click **Issue letter…** on the card, read what will be sent, and click **Issue and send letter**.

The member's standing is checked when the request is saved and again when the letter is issued: a member whose status bars them is refused.
The letter is numbered from the Visit / Letter No. series, emailed to the partner club's contact and to the member, and the visit is listed as **Letter issued**; when the partner confirms and the visit is over, click **Complete**.
The visit counts against the member's visits per period with that club.

### Confirm a visit

[Screenshot: Confirm visit dialog]

1. Click **Confirm…** on a requested visit.
2. Read the preview: one sentence states what confirming will do, followed by the flight it will book (course, tee time, crossover time, holes and the seats free), the party, the player type the visitor is billed as, the visit count in the cap period and the club's total this year, whether the visit fee will be charged, and whether approval runs first.
   When the requested tee time cannot take the party, the preview names the nearest free times instead; edit the visit and try again.
3. Click the button, which names the outcome: **Confirm and book 08:04**, **Confirm visit** (no golf), or **Submit for approval**.

On confirmation the system finds or creates the visitor's golfer record stamped with the home club and member number, books the flight under that identity (the visitor and any other home-club members at the club's player type, guests as guests), and emails the confirmation to the visitor and to the home club's contact.
With approval, the visit sits **Pending approval** until the approver decides: approval confirms and books it, rejection declines it.

### Decline or cancel a visit

- Open the ⋮ menu and click **Decline** on a requested or pending visit; enter the **Reason** and click **Decline visit**.
  The visitor and the home club are emailed the reason.
- Click **Cancel visit** on a requested, pending or confirmed visit; enter the **Reason** and click **Cancel visit**.
  A confirmed visit's booking is cancelled with it; a visit whose players are already registered must have those registrations cancelled at the desk first.

### Receive the visitor and complete the visit

1. On the visit date, open the flight on the Tee Time Sheet; the visitor's line is tagged with the visit number and shows **Receive**.
2. Click **Receive**, tick **Letter of introduction sighted** and **Home club membership card and passport or ID sighted**, and click **Record arrival**.
   Until then the party cannot be registered.
3. Register, bill and settle as usual; when the club record names a visit fee item, it is added to the visiting member's bill at registration (never to their guests).
   Unless the club record allows charges to be signed back, the visitor's bills are settled before they leave.

The visit turns **Arrived** at the desk check and **Completed** when every registered player's bill is settled; **Complete** on the card closes a visit by hand when needed.
A visit whose date passes without an arrival expires overnight, and the person who recorded it is notified.

## Field reference

### Filters

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Visit date from** / **to** | No | The visit-date range to list. | Defaults to 7 days back and 60 days ahead; up to 500 visits are listed. |
| **Status** | No | All, or one state. | |

### New / Edit visit drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Inbound / Outbound** | Yes | Whether a partner's member visits us, or our member visits them. | Picked when the visit is recorded; fixed afterwards. |
| **Home club** / **Club to visit** | Yes | The affiliated association or reciprocal club. | Active clubs only; the agreement must be in force on the visit date. |
| **Member No** (outbound) | Yes | Our member's number. | The member must exist and be in good standing (status action control). |
| **Letter reference** | No | The home club's letter or card number. | Up to 100 characters. |
| **Upload letter** | No | The letter as a PDF or image. | Up to 5 MB; kept with the visit; the change is saved with the record. |
| **Name** | Yes | The visiting member's name as the letter states it. | Up to 255 characters. |
| **Home club member no** | Yes | Their membership number at the home club. | Up to 50 characters; the visit cap counts by it. |
| **Identity / Passport No.**, **Mobile**, **Email** | No | Contact and identity details from the letter. | A valid email; the phone takes a country code and number. |
| **Visit date** | Yes | The day of the visit. | Within the club's agreement dates. |
| **Alternate date** | No | A fallback the letter offers. | Informational; the visit books on the visit date. |
| **Golf requested** | No | Tick when the letter asks for golf. | Ticked by default. |
| **Course**, **Preferred tee time**, **Holes** | For booking | Where and when the party tees off. | Both course and tee time are needed before Confirm can book. |
| **Players (visitor included)** | Yes while golf | The size of the golf party. | 1 to 10. |
| **Of which guests** | No | Guests the visitor brings. | Fewer than the party; within the club's guests per visit. |
| **Dining**, **Accommodation**, **Sports facilities**, **Other facilities** | No | The other facilities the letter asks for. | Up to 255 characters each; shown on the card and in the letters and confirmation emails. |
| **Remarks** | No | Anything the desk should know. | Up to 255 characters. |

### Decline / Cancel

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Reason** | Yes | Why the visit is declined or cancelled. | Up to 255 characters; emailed on a decline, kept on the record. |

## Tips & troubleshooting

- If you see "The arrangement with X starts on ..." or "... ended on ...", the visit date lies outside the club's agreement dates.
- If you see "X members may bring at most 2 guest(s) per visit." or "... may not bring guests.", reduce the guests.
- If you see "Tan Wei Ming already has 14 visit(s) from X in this year - the arrangement allows 14.", the member has used the club's visit cap for the period.
- If you see "X has already used 50 of its 50 visits for 2026.", the partnership's annual quota is exhausted.
- If you see "Member A0018 (Suspended) is not in good standing - a letter cannot be issued.", the member's status bars them; see Membership Status.
- If you see "Golf: the request needs a course and a tee time before it can be confirmed - edit the visit.", fill both on the record.
- If you see "E1 08:04 cannot take 3 player(s) on ... - nearest available: 07:57, 08:11, 08:18. Edit the visit's tee time.", the requested flight is full or closed; pick one of the times named.
- If you see "X has no active affiliate player type - fix the club record first.", the club's player type is disabled or missing; see Affiliated Clubs and Player Types.
- If you see "Configure the Visit No. numbering scheme first" or "Configure the Booking No. numbering scheme (auto-generate) first", set the series under Numbering Control; a visit books under an auto-generated Booking No.
- If you see "Visit V... has registered players - cancel their registrations at the desk first.", the party has already registered; the desk cancels the registrations before the visit can be cancelled.
- If the Tee Time Sheet says "Visit V...: record Tan Wei Ming's arrival first (letter of introduction and ID sighted).", click **Receive** on the visitor's line before registering the party.
- A visit's golf booking is an ordinary flight booking under the visitor; it appears on the Golf Booking screen and the Tee Time Sheet like any other, tagged with the visit number.

## Related options

- Membership Management → Common Setup → Affiliated Clubs - the arrangements and their terms.
- Membership Management → Numbering Control - the Visit / Letter No. series.
- Golf Management → Common Setup → Player Types - the affiliate player type the visitor is billed as.
- Golf Management → Front Desk → Tee Time Sheet - receiving the visitor, registering, billing and settling.
- Golf Management → Numbering Control - the Booking No. series a visit books under (auto-generated).
- Workflow → Approval Setup - the chain for the purpose Affiliated club visit.
