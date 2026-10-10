# Unverified Registrations

> **Where:** SaaS Administration → Access → Unverified Registrations
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> The **Delete** button needs the Delete permission; a role without it can review the list but not delete.

## What this option is for

When someone registers on the platform with an email and password, the system sends them an activation link and holds the account as unverified until they click it.
Registrations that are never activated - mistyped addresses, abandoned sign-ups, spam - pile up and, more importantly, block the email address: a genuine person cannot register with it while the dead account exists.
This screen lists every unverified registration so you can review and delete the stale ones, freeing their addresses.
It is deliberately a manual review page rather than an automatic clean-up, so nothing is ever removed without an administrator looking at it.

## The screen at a glance

[Screenshot: Unverified Registrations list]

- A summary line, e.g. "12 unverified registration(s); the 9 older than 7 days are pre-selected. Accounts linked to a workspace can never be deleted here."
- One card per registration with a checkbox, the email address, and a sub-line with the registration date, the age in days and the sign-in method.
  A registration that belongs to a workspace adds "has a workspace (protected)" and its checkbox is greyed out.
- A chip on the right reads **> 7 days** (red) for stale registrations or **recent** (grey).
- Registrations older than 7 days are ticked for you when the page opens; recent ones are not.
- A red **Delete N registration(s)** button at the bottom, where N is the number currently ticked.
- After a deletion, a report stays on the page listing how many were deleted and, for any that were skipped, the reason.

## Common tasks

### Clean up stale registrations

1. Review the list; the registrations older than 7 days are already ticked.
2. Untick any you want to keep (for example a sign-up you know is being followed up), and tick any recent one you are sure is junk.
3. Click **Delete N registration(s)**.
4. A confirmation states "Permanently delete N unverified registration(s)? Their email addresses are freed for a genuine registration. This cannot be undone."; click **Delete**.
5. The report shows the result, e.g. "9 registration(s) deleted, 1 skipped." with a line per skipped item and its reason, and the list reloads.

### Free one specific email address

1. Find the address in the list.
2. Untick everything else, tick that one, and click **Delete 1 registration(s)**.
3. Confirm; the address can now be used for a fresh registration.

## Field reference

### Registration card (read-only)

| Field | What it shows |
| --- | --- |
| **Checkbox** | Whether the registration is selected for deletion; greyed out for protected registrations. |
| **Email** | The address that registered. |
| **Sub-line** | The registration date, its age in days, the sign-in method, and "has a workspace (protected)" when the account already belongs to a company. |
| **Chip** | **> 7 days** for stale registrations, **recent** otherwise. |

## Tips & troubleshooting

- A registration is skipped, whatever you ticked, when it is "already verified" (the person activated in the meantime), "has a workspace" (it belongs to a company), is on the "admin allowlist" (a protected administrator address), or is "not found" (already removed); the report names each one.
- If you see "No registrations selected." tick at least one before clicking Delete.
- If you see "Failed to load registrations." or "Failed to delete registrations." something went wrong on the server; try again, and contact support if it persists.
- "No unverified registrations - nothing to clean up." means the list is empty; there is nothing to do.
- Deletion is permanent and the confirmation says so; when in doubt, leave a recent registration for the next review.
- A registration that keeps reappearing for the same address may be a sign of abuse; the registration flow already blocks disposable addresses, so report persistent cases to support.

## Related options

- **Platform Users** (SaaS Administration → Access → Platform Users) - the verified platform accounts.
- **Subscriber Management** (SaaS Administration → Subscriber Management) - subscribers provisioned here are created already verified and never appear in this list.
- **Audit Log** (SaaS Administration → Access → Audit Log) - records each deletion made here.
