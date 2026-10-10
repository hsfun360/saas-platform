# Assign Role

> **Where:** SaaS Administration → Access → Assign Role
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.

## What this option is for

Assign Role is where a platform user is given a system role - the step that turns a bare platform account into someone who can actually open screens.
Platform Users creates the account and System Roles defines the access levels; this screen joins the two, one user to one role.
A user holds exactly one system role at a time: assigning a new role replaces the previous one.
Staff come here right after creating a platform user, when a colleague changes job, or to check who currently holds which role.

## The screen at a glance

[Screenshot: Assign Role form and the Current assignments list]

- A form card with two pickers, **User** and **Role**, and an **Assign Role** button.
- A **Current assignments** list below it, one card per platform user who already holds a system role, showing the name, the email and a badge with the role.
  Users with no role yet are not listed.

## Common tasks

### Grant or change a user's role

1. In **User**, type a few letters of the person's name or email and pick them from the list.
2. In **Role**, type or pick the system role.
3. Click **Assign Role**.
4. A green message confirms "User assigned to role successfully." for a first assignment, or "User role updated successfully." when the role replaced an earlier one.
   The form clears and the Current assignments list refreshes.

The user sees their new menus after their next login.

### Check who holds a role

- Scan the **Current assignments** list; the badge on each card is the role.
  To remove someone's access entirely, deactivate their account on Platform Users.

## Field reference

### Assign form

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **User** | Yes | The platform user to grant the role to; the list shows name and email. | Must be picked from the list; only platform users are offered. |
| **Role** | Yes | The system role to grant, as defined on System Roles. | Must be picked from the list; replaces any role the user already holds. |

### Current assignments card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The user's full name (or email when no name is recorded). |
| **Email** | The sign-in address. |
| **Role badge** | The system role currently held. |

## Tips & troubleshooting

- If you see "Please select a user." or "Please select a role." both pickers must have a value from their lists; free text is not accepted.
- If you see "User ID and Role ID are required." the form was submitted without both choices; pick them and try again.
- If you see "User not found." or "Role not found." the user or role was removed while you were on the screen; refresh the page.
- If you see "Failed to assign role." something went wrong on the server; try again, and contact support if it persists.
- A user who signs in but sees no menus has no role: assign one here.
- A role that users hold cannot be deleted on System Roles; move those users to another role here first.

## Related options

- **Platform Users** (SaaS Administration → Access → Platform Users) - create the accounts that appear in the User picker.
- **System Roles** (SaaS Administration → Access → System Roles) - define the roles that appear in the Role picker.
