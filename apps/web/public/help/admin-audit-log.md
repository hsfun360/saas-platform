# Audit Log

> **Where:** SaaS Administration → Access → Audit Log
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> This screen is read-only, so no Create, Edit or Delete permission applies.

## What this option is for

The Audit Log is the platform's tamper-proof record of who changed what, and when.
Every create, update and delete made anywhere on the platform - by staff of any subscriber, by platform administrators, or by the system itself - is written to the trail automatically and can never be edited or removed.
Staff come here to answer questions such as "who disabled this currency?", "what did this subscriber's settings look like before yesterday?", or "which records did a particular user touch last week?".
Subscribers have their own, narrower view of the same trail under System Setup; this screen shows the whole platform.

## The screen at a glance

[Screenshot: Audit Log list with the filter bar]

- A filter bar at the top with five boxes: **Table**, **Record id**, **User email**, **From** and **To**, plus **Apply** and **Clear** buttons.
- A count line, e.g. "128 entries · page 1 of 3", once entries are loaded.
- One card per audit entry, newest first.
  The title line shows the table (the kind of record) and the record's identifier.
  The sub-line shows the date and time of the change, the email of the user who made it (or "system" when no user was involved), and the user's network address when known.
- A chip at the top right of each card shows the action: **create** (green), **update** (grey) or **delete** (red).
- Clicking a card expands it to show every field that changed, as "old value → new value".
  A request reference is shown underneath when one was recorded.
- **Previous** and **Next** buttons at the bottom move between pages of 50 entries.

## Common tasks

### Find the changes to one record

1. Type the record's identifier exactly as it appears in the system into **Record id** (the identifier shown on the card title line, usually a long code).
2. Optionally type part of the table name into **Table** to narrow the results, e.g. `Membership`.
3. Click **Apply**.
4. Click any card to see the field-by-field changes.

### See what one user did

1. Type part of the user's email address into **User email**; matching is "contains", so `tan@` finds every address containing those characters.
2. Pick a **From** date and a **To** date from the calendars to limit the period.
   The From date starts at midnight and the To date runs to the end of that day.
3. Click **Apply**.

### Start again

- Click **Clear** to empty every filter box and reload the newest entries.

### Read the details of a change

- Click the card once to expand it, and again to collapse it.
- Each row in the expanded panel is one field: the field name, the value before the change, an arrow, and the value after.
  A dash means the field was empty.
- For a **create**, every field shows an empty "before" value; for a **delete**, every field shows an empty "after" value.

## Field reference

### Filter bar

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Table** | No | Part of the name of the kind of record, e.g. `Membership`, `Company`, `Currency`. | Matches anywhere in the table name, ignoring capitalisation. |
| **Record id** | No | The exact identifier of one record, as shown on the card title line. | Exact match only; a partial identifier returns nothing. |
| **User email** | No | Part of the email address of the person who made the change. | Matches anywhere in the address, ignoring capitalisation. |
| **From** | No | The earliest date to include, picked from the calendar. | Entries from 00:00 on this day onwards. |
| **To** | No | The latest date to include, picked from the calendar. | Entries up to 23:59 on this day. |

### Audit entry card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The table (kind of record) followed by the record's identifier. |
| **Sub-line** | When the change happened, who made it (or "system"), and their network address when known. |
| **Action chip** | **create**, **update** or **delete**. |
| **Expanded panel** | One row per changed field: field name, value before, value after, plus the request reference when recorded. |

## Tips & troubleshooting

- If you see "Failed to load the audit log." the entries could not be fetched at that moment; click **Apply** again, and contact support if it persists.
- If a search returns "No audit entries match the current filters." check the Record id first: it must be typed in full, exactly as shown elsewhere in the system.
- Passwords, two-factor secrets, recovery codes, reset links and stored mail-server passwords are never shown: the trail records that such a field changed, but the value appears as `[REDACTED]`.
- Routine housekeeping is deliberately left out so the trail stays readable: an update that only touched timestamps, failed-login counters or the user's last-used workspace writes no entry, and the queue, session and trail tables themselves are never audited.
- Bulk operations run by the system (for example large imports) may not appear entry-by-entry.
- Entries cannot be edited or deleted from this screen or anywhere else; if an entry looks wrong, the underlying record was really changed that way.

## Related options

- **Platform Users** (SaaS Administration → Access → Platform Users) - the platform user accounts whose email addresses appear in the trail.
- **Subscriber Management** (SaaS Administration → Subscriber Management) - the subscriber accounts whose staff changes are also recorded here.
- **Account Audit Log** (System Setup, used by Tenant Admins) - the subscriber-scoped view of the same trail.
