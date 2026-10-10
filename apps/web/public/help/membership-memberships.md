# Memberships

> **Where:** Membership Management → Memberships
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create, Edit and Delete permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

The Memberships screen is the heart of the Membership module: every membership your club has sold, with the people under it.
A membership is either **Individual** (one person holds it - their profile is captured when the membership is created, and the member record is created with it) or **Corporate** (a company holds it and names **nominees** to use it).
Both kinds of principal - the individual member or a nominee - can have **dependents** (spouse, son, daughter or ward).
The membership carries the commercial side: type, status, fee, join and expiry dates, credit terms, document references, the sales agent, and for a corporate membership the company profile and addresses.
Staff come here to sign up a new member, change a membership's status or fee, add nominees and dependents, and maintain personal details.
When a membership is created, the system sends a welcome email to the member (or the corporate contact); an individual member's email also carries a link to register for the member portal.

## The screen at a glance

[Screenshot: Memberships list]

- A count line reads e.g. "120 memberships - 95 individual, 25 corporate".
- Filter chips **All** / **Individual** / **Corporate** and a status filter (**All statuses** by default).
- A search box that searches as you type (after a short pause), matching the membership number, the corporate name and the individual member's name; a sort menu next to it orders by **Number**, **Name**, **Join date**, **Expiry date** or **Newest**.
- Each membership is a card: "membership number - name" as the title, a chip with the class and the type code, then the join date, the expiry date (term memberships), the nominee count (corporate) and the dependent count.
- The membership status is shown top-right as a coloured dot and the status name, with the colour from the Membership Status master.
- Each card has an **Edit** button and a ⋮ menu holding **Members**.
- A footer reads "Showing X of N" with a **Load more** button while more memberships remain (50 per page).
- The **New membership** button floats at the bottom right of the screen.

## Common tasks

### Create an individual membership

[Screenshot: New membership - class picker, then the individual form]

1. Click **New membership** and choose **Individual** - "one person holds the membership; their profile is captured now".
2. Under **Membership**, pick the **Membership type** (only individual types are offered); the **Status**, **Membership fee** and **Credit limit** fill in from the type's defaults and can be changed.
3. If the club numbers memberships manually, enter the **Membership number**; with auto-numbering the field reads "Issued on save".
4. Check the **Join date** (today by default).
   For a term type the **Expiry date** is pre-filled from the term (join date plus the term, less one day) and can be adjusted.
5. Under **Credit & billing**, set the credit terms (shown only when the club has a credit facility) and tick **Monthly fee** or **Yearly fee** to say when the membership fee is billed.
6. Under **References**, fill in any certificate, application or reference numbers, the **Proposer** (committee clubs) or the **Sales agent** and **Follow-up sales agent** (commercial clubs).
7. Fill in the member's profile: **Photo**, **Identity** (the **Last name** is required), **Personal**, **Contact**, **Employment**, **Addresses** and **Notes**.
8. Click **Save**.

The membership and its individual member are created together; the member's number equals the membership number.
A welcome email goes to the member's email address if one was entered.

### Create a corporate membership

[Screenshot: New corporate membership form]

1. Click **New membership** and choose **Corporate** - "a company holds the membership; nominees are added after saving".
2. Pick the **Membership type** (only corporate types are offered), check the **Join date** and optionally the **Billing date**.
3. Under **Company profile**, enter the **Company name** (required) and the registration, tax, contact and industry details, then the company's **Addresses** (Company and Mailing).
4. Complete **Credit & billing**, **References** and **Notes** as for an individual membership.
5. Click **Save**, then open the card's ⋮ menu → **Members** to add the nominees.

The welcome email goes to the company's contact email if one was entered.

### Edit a membership

1. Find the membership (search, filters or sort) and click **Edit**.
2. Change what you need.
   The **Class**, **Membership type** and **Membership number** cannot be changed after creation - they define the membership.
   On an individual membership the person's profile is edited from the **Members** dialog, not here.
3. Click **Save**.

Changing the status of an individual membership also changes its member's status.
Saving a changed credit limit updates the member's account limit in Account Receivable; the line under the field shows the account's current limit and outstanding balance.
If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Manage the people under a membership (Members dialog)

[Screenshot: Members dialog - list view]

1. Open the card's ⋮ menu and click **Members**.
2. The dialog lists each principal (the individual member, or every nominee) with their number and status, and their dependents indented beneath.
   A corporate membership shows "N of M nominee seats used" and a **New nominee** button, disabled once every seat is taken.
3. Use **Edit** on any person to change their details, or the principal's ⋮ menu → **Add dependent**.
4. Click **Close** when done.

### Add a nominee (corporate membership)

[Screenshot: New nominee form]

1. In the Members dialog click **New nominee**.
2. The **Member number** is suggested from the membership number plus the club's nominee suffix (for example `CORP-0003-A`) and can be changed; the **Status** starts as the membership's status.
3. Optionally set the nominee's **Join date** and **Credit limit** (shown only with a credit facility).
4. Fill in the person's profile - the **Last name** is required.
5. Click **Save**; **Back to list** returns without saving.

### Add a dependent

[Screenshot: New dependent form]

1. In the Members dialog open the principal's ⋮ menu and click **Add dependent**.
2. The **Member number** is suggested from the principal's number plus the club's dependent suffix; pick the **Dependent type** (Spouse, Son, Daughter or Ward); the **Status** starts as the principal's status.
3. For a son, daughter or ward, set the **Expiry date** - the date the child ages out.
4. Fill in the person's profile - the **Last name** is required.
5. Click **Save**.

A dependent cannot have dependents of their own.

### Edit a person

1. In the Members dialog click **Edit** on the person.
2. Change the **Status**, dates, profile, contact details or addresses; the **Member number** cannot be changed.
3. Click **Save**.

### Upload or change a member's photo

- In the Photo section click **Upload photo** (or **Change photo**), pick a JPG or PNG under 2 MB; it uploads at once and shows in the dialog.
- Click **Remove** to clear it.
- The photo is kept when you click **Save**.

### Maintain addresses

- Click **Add address** to add a row, pick its **Type** and fill the lines.
  A person's book offers Residential, Mailing, Company and Other; a corporate membership's book offers Company and Mailing.
- Only one address of each type is allowed, so **Add address** disappears once every type is used.
- Mail goes to the Mailing address when one exists, otherwise to the Residential (person) or Company (corporate) address.
- **Remove ... address** deletes a row.

## Field reference

### New / Edit membership dialog - Membership section

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Class** | Yes | Individual or Corporate, picked on the first step; **Change** is offered only before you type anything. | Fixed after creation. |
| **Membership type** | Yes | The type sold; it brings its default status, fee and credit limit. | Only active types of the picked class; fixed after creation. |
| **Membership number** | Yes, when numbering is manual | The number from the pre-printed card, e.g. `M-0001`; reads "Issued on save" under auto-numbering. | Up to 30 characters; must be unused as a membership or member number. |
| **Status** | No | The membership's status; leave as "Type default" to take the type's default status. | Required if the type has no default status. |
| **Membership fee** | No | The fee billed to this membership; defaults from the type. | A fee from the Membership Fee master. |
| **Join date** | Yes | When the membership starts; today by default. | A valid date. |
| **Expiry date** (term types) | No | When the membership ends; pre-filled from the type's term, less one day. | Must be after the join date. |
| **Billing date** (corporate) | No | The corporate membership's billing date. | A valid date. |

### Credit & billing section

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Credit flag** (individual) | No | **Personal** - a limit per person, or **Combined** - one limit for the membership. | Hidden when the club has no credit facility. |
| **Credit limit** | No | The credit extended to the membership's account; defaults from the type. The line beneath shows the live account standing. | 0.00 or more; stored as 0 when the credit facility is off. |
| **Terms (days)** | No | The payment terms in days, e.g. `30`. | A whole number of days. |
| **Statement** | No | **Individual** - one statement per person, or **Combined** - one statement for the membership. | - |
| **Send arrears reminders** / **Charge late-payment interest** | No | Tick to include the account in reminder and interest runs. | Hidden when the credit facility is off. |
| **Monthly fee** / **Yearly fee** | No | Tick how the membership fee is billed: every month, or once a year in the join-date anniversary month. Neither ticked means the fee is not raised by the billing run. | - |

### References section

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Certificate no.** / **Application no.** / **Reference** | No | Document numbers kept with the membership. | Up to 255 characters each. |
| **Proposer** (committee clubs) | No | The member who proposed the applicant. | Up to 255 characters. |
| **Sales agent (closed the sale)** (commercial clubs) | No | The agent who sold the membership; drives Agent Performance. | An active sales agent. |
| **Follow-up sales agent** | No | The agent currently servicing the member. | An active sales agent. |

### Company profile section (corporate)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Company name** | Yes | The corporate member's name. | Up to 255 characters. |
| **Registration no.** / **Tax registration no.** | No | The company's registration and tax numbers. | Up to 255 characters each. |
| **Contact person** / **Contact designation** | No | Who the club deals with and their title. | Up to 255 characters each. |
| **Phone** / **Mobile** / **Fax** | No | Pick the country code, then type the number. | - |
| **Email** | No | The contact email; the welcome email goes here. | Must be a valid email if filled. |
| **Industry** | No | The company's industry, from the Industry Types list. | - |

### Person profile (individual member, nominee, dependent)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Photo** | No | A JPG or PNG portrait; uploads immediately. | Under 2 MB. |
| **Salutation** / **Title** | No | From the Salutations and Titles lists. | - |
| **First name** / **Middle name** | No | The person's given names. | Up to 255 characters each. |
| **Last name** | Yes | The person's family name. | Up to 255 characters. |
| **Name on card** | No | The name printed on the membership card. | Up to 255 characters. |
| **Name (native script)** | No | The name in the person's own script, e.g. Chinese characters. | Up to 255 characters. |
| **Gender** | No | Male or Female. | - |
| **Birth date** | No | Pick from the calendar; feeds the age charts. | A valid date. |
| **Passport / ID number** | No | The identity document number. | Up to 100 characters. |
| **Nationality** / **Race** | No | From the Nationalities and Races lists. | - |
| **Marital status** | No | Single, Married, Divorced or Widowed; Married reveals the **Marriage date**. | - |
| **Phone** / **Mobile** / **Fax** | No | Pick the country code, then type the number. | - |
| **Email** | No | The person's email; the individual member's welcome and portal link go here. | Must be a valid email if filled. |
| **Employer / company** / **Designation** / **Industry** | No | Employment details. | Up to 255 characters; industry from the list. |
| **Remarks** | No | Free notes. | Up to 2000 characters. |

### Member section (Members dialog form)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Member number** | Yes | Suggested from the principal's number plus the club suffix; editable on creation. | Up to 30 characters; unique in the company; fixed after creation. |
| **Dependent type** (dependents) | Yes | Spouse, Son, Daughter or Ward. | - |
| **Status** | Yes | The person's own status. | A status from the Membership Status master. |
| **Join date** | No | When the person joined. | A valid date. |
| **Expiry date** (son, daughter, ward) | No | When the child dependent ages out. | A valid date. |
| **Credit limit** (nominees) | No | The nominee's personal account limit; the line beneath shows the live account standing. | 0.00 or more; hidden without a credit facility. |

### Addresses (both books)

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Type** | Yes | Residential, Mailing, Company or Other (a corporate membership offers Company and Mailing). | One address per type. |
| **Address** | Yes, per row | The street address. | Up to 255 characters. |
| **City** / **Postcode** / **State** | No | The rest of the address. | City and state up to 100 characters; postcode up to 20. |
| **Country** | No | From the active countries list. | - |

## Tips & troubleshooting

- If you see "Membership number is required (no auto-numbering scheme is active)." the club numbers manually; enter the number, or switch on auto-numbering on Club Specification.
- If you see "Membership number 'X' is already in use." or "Member number 'X' is already in use." that number exists; pick another, or let auto-numbering issue one.
- If you see "Select a membership status (the type has no default status)." pick a status, or give the type a default status on Membership Type.
- If you see "Membership type 'X' is disabled." the type was retired; enable it or pick another.
- If you see "Company name is required for a corporate membership." fill in the company name.
- If you see "Expiry date must be after the join date." correct the dates.
- If you see "This membership allows at most N nominee(s)." every seat of the type is taken; raise **No. of nominee** on the type or remove a seat.
- If you see "Nominees can only be added to a corporate membership." or "A dependent cannot have dependents of their own." the person you chose cannot take that kind of member.
- If you see "Select the dependent type (spouse, son, daughter or ward)." pick the relationship.
- If you see "Only one X address is allowed." change the type of the duplicate address row.
- If you see "Sales agent not found." or "Follow-up sales agent not found." the agent was disabled; pick an active one.
- If you see "The photo must be an image file." or "The photo must be 2 MB or smaller." pick a smaller JPG or PNG.
- If you see "Your role's data scope does not allow amending this record." the membership was created by someone outside your data scope; ask your administrator.
- If a save is rejected, every folded section opens so you can see the field in error.
- Set up Membership Types with defaults first: the New membership form then needs only the type, the join date and the person's last name.
- The Proposer field, the sales agent pickers and the credit terms appear or disappear according to the Club Specification.

## Related options

- Membership Management → Members - the fast read-only search across every person.
- Membership Management → Membership Type / Membership Status / Membership Fee - the masters picked on a membership.
- Membership Management → Club Specification - admission model, credit facility, membership numbering and the nominee/dependent suffix.
- Membership Management → Numbering Control - the Membership No. series.
- Membership Management → Sales Agents - the agents offered in the pickers.
- Membership Management → Billing Schedules - raises the membership fee and standing charges for these memberships.
- Membership Management → Membership Import - loads memberships and members from Excel instead of keying them.
- System Setup → Salutations, Titles, Nationalities, Races, Industry Types - the reference lists used on the profile.
- Account Receivable → Debtors - the member accounts where credit limits and charges live.
