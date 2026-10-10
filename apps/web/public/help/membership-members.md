# Members

> **Where:** Membership Management → Members
>
> **Who can use it:** users whose role includes the Membership Management module.

## What this option is for

The Members screen is a fast, read-only search across every person your company knows under its memberships: the individual members, the nominees of corporate memberships and the dependents (spouse, son, daughter, ward) of both.
It answers front-desk questions such as "which membership does this person belong to?", "what is their status?" or "what is their member number?" without opening each membership.
People are created and edited on the Memberships screen (the Members dialog of each membership); nothing can be changed here.

## The screen at a glance

[Screenshot: Members search]

- Filter chips at the top: **All**, **Individual Member**, **Nominee**, **Dependent**; next to them a status filter (**All statuses** by default).
- A search box that searches as you type (after a short pause), matching the member number, first name, last name, local name, ID number and email.
- A count line reads "N member(s) found." or "Showing X of N members - type to narrow, or load more below."
- Each person is a card: the photo (when one is on record), then "member number - name" as the title; a chip with the kind (or the dependent relationship), the membership number and, for a corporate membership, the company name.
- A meta line shows the ID number, email, mobile, join date and, for a child dependent, the expiry date.
- The member's status is shown top-right as a coloured dot and the status name - the colour is the one set on the Membership Status master.
- A footer reads "Showing X of N" with a **Load more** button while more results remain; results come 200 at a time, newest first.

## Common tasks

### Find a person

1. Type part of their member number, name, ID number or email in the search box; the list refreshes on its own.
2. Narrow further with a kind chip (for example **Dependent**) or pick a status in the status filter.
3. Click **Load more** if the person is not in the first 200 results, or type more characters to narrow the search.

### Check a person's standing

- Read the status dot and name top-right of the card; the colour matches the Membership Status master, so a glance tells you whether the person is active, suspended, and so on.
- Note the **Expires** date on a child dependent's card - it is the date the child ages out of the membership.

### Open the person's membership

- Note the membership number on the card's sub-line, then open Membership Management → Memberships and search for that number; the membership's Members dialog is where the person's details are edited.

### Clear the search

- Click **Clear search** in the empty state (or the ✕ in the search box) to remove the search text and the kind and status filters at once.

## Field reference

This screen has no form; the filters are the only inputs.

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Kind** chips | No | All, Individual Member, Nominee or Dependent. | Applied on the server; the list reloads. |
| **Status** | No | One status from the Membership Status master, or All statuses. | Applied on the server; the list reloads. |
| **Search** | No | Any part of a member number, first or last name, local name, ID number or email. | Searches on the server after you pause typing; 200 results per page. |

## Tips & troubleshooting

- If the list says "No members yet. Members appear here once memberships are created on the Memberships screen.", no membership has been created for this company.
- If you see "Select a workspace first." pick a company in the header before using this screen.
- Searching by a full ID number or email is the quickest way to land on exactly one person.
- The individual member of an individual membership carries the same number as the membership; nominees and dependents carry the principal's number plus a suffix, so searching the membership number also finds everyone under it.

## Related options

- Membership Management → Memberships - where people are created and edited (New membership, Members dialog with New nominee / Add dependent / Edit).
- Membership Management → Membership Status - the statuses and colours shown on each card.
- Membership Management → Club Specification - the suffix style of nominee and dependent numbers.
