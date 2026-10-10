# Audit Log

> **Where:** System Setup → Audit Log
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).

## What this option is for

The Audit Log is a read-only record of what your staff changed in the system, when, and from where.
Every create, update and delete made in any of your companies is written to it automatically, together with the field-by-field before and after values.
Nothing on this screen can be edited or removed: the log is append-only, so it is a trustworthy trail for investigations, audits and "who changed this?" questions.
The view is limited to your own organization: it shows actions taken in your companies by your people, and leaves out platform-side activity and the platform's shared user accounts (changes to a person's company access and role still appear).
Staff come here to trace an unexpected change, to confirm who disabled or created a record, or to review a colleague's activity over a period.

## The screen at a glance

[Screenshot: Audit Log with filters and entries]

- A filter bar across the top with **Table**, **Record id**, **User email**, **From** and **To**, plus **Apply** and **Clear** buttons.
- A line stating how many entries match and which page you are on (50 entries per page).
- Each entry is a card whose title is the table (the kind of record) and the record identifier, with the date and time, the email of the person who made the change (or "system"), and their network address underneath.
- A chip at the top right of each card shows the action: **create** (green), **update** (grey) or **delete** (red).
- Clicking an entry expands it to show every changed field with its old value, an arrow, and its new value; a dash means the value was empty.
  A request reference is shown at the bottom when one was recorded.
- **Previous** and **Next** buttons below the list move between pages.

## Common tasks

### Find out who changed a record

1. In **Table**, type part of the record kind, for example `Membership`.
2. In **Record id**, paste the record's identifier if you have it, or leave it blank to see all records of that kind.
3. Click **Apply**.
4. Click the entry to expand it and read the old and new values of each changed field.

### Review one person's activity over a period

1. In **User email**, type part of the person's email address.
2. Set **From** and **To** to the dates you are interested in; either can be left blank for an open-ended range.
3. Click **Apply** and page through the results with **Next** and **Previous**.

### Start again

Click **Clear** to empty every filter and reload the most recent entries.

## Field reference

### Filter bar

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Table** | No | Part of the record kind to show, e.g. `Membership` or `Role`. | Matches anywhere in the name, ignoring case. |
| **Record id** | No | The exact identifier of one record, as shown in an entry's title. | Exact match only. |
| **User email** | No | Part of the email address of the person who made the change. | Matches anywhere in the address, ignoring case. |
| **From** | No | The first day to include - pick it from the calendar. | Includes the whole day from midnight. |
| **To** | No | The last day to include - pick it from the calendar. | Includes the whole day up to midnight. |

## Tips & troubleshooting

- If the screen says "No audit entries match the current filters." widen the dates, shorten the text you typed, or click **Clear**.
- If you see "Failed to load the audit log." or "Your account could not be resolved." reload the page; if it persists, sign out and in again or ask your administrator.
- Entries made by automated processes show "system" instead of an email address.
- Bulk operations such as imports may not record a per-row entry; look for the import batch instead.
- The newest entries are always first; use the date filters rather than paging when looking for something old.

## Related options

- **User Management** (System Setup → User Management) - the people whose email addresses appear in the log.
- **Role Management** (System Setup → Role Management) - changes to roles and permissions are recorded here as well.
