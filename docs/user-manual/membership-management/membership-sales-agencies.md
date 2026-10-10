# Sales Agencies

> **Where:** Membership Management → Sales Agencies
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create, Edit and Delete permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

The Sales Agencies screen keeps the outsourced agency companies your club engages to promote and sell its memberships.
An agency is a company record - code, name, registration number, office address and a contact person - and its salespeople are then added on the Sales Agents screen as **Agency staff** linked to the agency.
Staff come here when the club signs a new agency, when an agency's contact details change, or to retire an agency the club no longer works with.
The screen is only relevant for a commercial club that has the **Sales agencies** channel enabled on the Club Specification.

## The screen at a glance

[Screenshot: Sales Agencies list]

- A search box filters the list as you type, matching the code, name, registration number, contact person and email.
- Each agency is a card: "code - name" as the title, the registration number in brackets and the contact person on the sub-line, then the email, mobile and the number of **Agents** linked to it.
- A status chip top-right shows **Active** or **Disabled**.
- Each card has an **Edit** button and a ⋮ menu holding **Enable** or **Disable**.
- The **New agency** button floats at the bottom right of the screen.

## Common tasks

### Add a new agency

[Screenshot: New agency dialog]

1. Click **New agency**.
2. Under **Agency**, enter the **Agency code** and **Agency name**; optionally the **Registration no.** and the office **Address** (address line, city, postcode, state, country).
3. Under **Contact**, optionally enter the **Contact person**, **Email**, **Phone** and **Mobile**.
4. Click **Save**.

The agency appears in the list and can be picked when creating an agency-staff sales agent.

### Edit an agency

1. Find the agency (use the search box if the list is long) and click **Edit**.
2. Change what you need - the code can be changed as long as it stays unique.
   Clearing the address line removes the agency's address altogether.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable an agency

- Open the card's ⋮ menu and click **Disable** to retire an agency.
  Its existing agents stay on record, but no new agency-staff agent can be attached to it.
- Open the ⋮ menu of a disabled agency and click **Enable** to bring it back.

Agencies are never deleted, because their agents and the memberships they sold reference them.

## Field reference

### New agency / Edit agency dialog - Agency section

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Agency code** | Yes | A short code identifying the agency, e.g. `AGY01`. | Up to 30 characters; must be unique within the company. |
| **Agency name** | Yes | The agency's trading name, e.g. `Prime Leisure Marketing Sdn Bhd`. | Up to 255 characters. |
| **Registration no.** | No | The agency's business registration number, shown in brackets on the card. | Up to 100 characters. |
| **Address** | No | The agency's office street address; leave empty for no address. | Up to 255 characters. |
| **City** / **Postcode** / **State** | No | The rest of the office address. | City and state up to 100 characters; postcode up to 20. |
| **Country** | No | The office country, picked from the active countries list. | - |

### New agency / Edit agency dialog - Contact section

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Contact person** | No | The person the club deals with at the agency. | Up to 255 characters. |
| **Email** | No | The agency's contact email. | Must be a valid email if filled. |
| **Phone** | No | The office phone - pick the country code, then type the number. | - |
| **Mobile** | No | The contact's mobile - pick the country code, then type the number. | - |

## Tips & troubleshooting

- If you see "Agency 'X' already exists." another agency in this company already has that code.
- If you see "Agency code is required." or "Agency name is required." fill in the two mandatory fields.
- If you see "Address must be 255 characters or fewer." shorten the street line.
- If you see "Your role's data scope does not allow amending this record." the agency was created by someone outside your data scope; ask your administrator.
- If the Sales Agencies menu does not appear, check that the **Sales agencies** channel is enabled on Membership Management → Club Specification and that your club is not a committee club.
- Disable rather than rename an agency you stop working with, so Business Insights keeps reporting the memberships it closed under its own name.

## Related options

- Membership Management → Sales Agents - the salespeople; agency staff are linked to an agency from this list.
- Membership Management → Club Specification - the Sales channels switches.
- Membership Management → Business Insights → Agent Performance - closings by channel and agency.
- SaaS Administration → Countries - the countries offered in the address.
