# User Management

> **Where:** System Setup → User Management
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The Create user, Invite collaborator, Edit, Revoke and Remove from company controls only appear when the role also has the matching Create, Edit and Delete permissions on this screen.

## What this option is for

User Management is where you decide who can sign in to your companies and what they are there.
Each person is listed once, with every company they belong to and the role they hold in each.
From here you create new staff accounts, invite outside collaborators by email, update a person's profile, place them in companies with a role, department and position, and remove access that is no longer needed.
Role controls what a person may do; department and position control whose records they may amend (a senior may amend a junior's records within the same department).
Staff come here when someone joins or leaves, changes job, or needs access to another club.

## The screen at a glance

[Screenshot: User Management people list]

- **People (N)** - a search box that filters as you type (email, name, company or role), followed by one card per person.
- Each person card shows the email as the title, the full name, and one line per company with the role held there (or **No role**); a person with no company shows **No company access**.
- Each card has an **Edit** button (opens the profile) and a **⋮** menu (More actions) holding **Companies & placement**.
- **Pending Invitations (N)** - cards for invitations that have been sent but not yet accepted, showing the email, company, role and expiry date, each with a red **Revoke** button.
- Two floating buttons sit at the bottom right: **Invite collaborator** and **Create user**.

## Common tasks

### Create a new user

[Screenshot: Create user dialog]

Use this for staff who will sign in with an email and password you set up.

1. Click **Create user**.
2. Enter the **Email**, **Full Name** and an initial **Password**; optionally the **Phone**.
3. Pick the **Company** the person starts in, and optionally their **Role**.
4. Optionally pick their **Department** and **Position** so their data scope is complete from day one.
5. Click **Save**.

The person appears in the list and can sign in straight away with the email and password you entered.

### Invite a collaborator

[Screenshot: Invite collaborator dialog]

Use this for someone who keeps their own identity - an external consultant, or a person who already has an account elsewhere - and must accept before joining.

1. Click **Invite collaborator**.
2. Enter the **Email**, pick the **Company** and optionally the **Role** they will join with.
3. Click **Send**.

An invitation email is sent and the invitation appears under **Pending Invitations**; it is valid for 7 days.
Once accepted, the person appears in the People list with that company and role.

### Revoke a pending invitation

1. Click **Revoke** on the invitation card.
2. Confirm - the dialog states that the link in their email stops working and they will not be able to join.

### Edit a person's profile

1. Find the person (use the search box if the list is long) and click **Edit**.
2. Change the **Full Name**, **Email**, **Phone** or **Bio**.
3. Click **Save**.

A person who also belongs to other organizations cannot have their profile edited here; the drawer explains this and only offers **Close**.
Their companies and roles are still managed under Companies & placement.

### Change a person's role, department or position in a company

[Screenshot: Companies & placement drawer]

1. Open the person's **⋮** menu and click **Companies & placement**.
2. On the row for the company, pick the **Role**, **Department** and **Position**.
3. Click **Update** on that row.

Each company row is saved separately with its own Update button.

### Give a person access to another company

1. In the Companies & placement drawer, scroll to **Add to another company** (shown only when there are companies the person is not yet in).
2. Pick the **Company** and optionally the **Role**.
3. Click **Add**.

### Remove a person from a company

1. In the Companies & placement drawer, open the company row's **⋮** menu and click **Remove from company**.
2. The drawer switches to a confirmation stating that they keep their account and their access to other companies; click **Remove from company** to proceed, or **Keep access** to cancel.

The last Tenant Admin of a company cannot be removed; assign another Tenant Admin first.

If you leave any of these drawers with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

## Field reference

### Create user dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Email** | Yes | The sign-in address, e.g. `user@example.com`. | Must be a valid email; up to 255 characters; must not already exist. |
| **Full Name** | Yes | The person's name as it should appear in the system. | Up to 150 characters. |
| **Password** | Yes | The initial password you will hand to the person. | At least 6 characters. |
| **Phone** | No | Pick the country code, then type the number. | - |
| **Company** | Yes | The company the person starts in. | Typing filters the list; only a listed company can be chosen. |
| **Role** | No | The role they hold in that company; leave as **No role** to decide later. | Roles come from Role Management. |
| **Department** | No | Their department in that company. | From the active departments. |
| **Position** | No | Their position (seniority) in that company. | From the active positions. |

### Invite collaborator dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Email** | Yes | The invitee's address. | Must be a valid email; up to 255 characters. |
| **Company** | Yes | The company they are invited to. | Typing filters the list; only a listed company can be chosen. |
| **Role** | No | The role they will join with. | Roles come from Role Management. |

### Edit profile drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Full Name** | Yes | The person's name. | Up to 150 characters. |
| **Email** | Yes | Their sign-in address. | Must be a valid email; up to 255 characters; must not be used by another user. |
| **Phone** | No | Pick the country code, then type the number. | - |
| **Bio** | No | A short note about the person. | Up to 500 characters. |

### Companies & placement drawer

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Role** (per company row) | Yes to Update | The role held in that company. | Required when you click Update. |
| **Department** (per company row) | No | Their department in that company. | From the active departments. |
| **Position** (per company row) | No | Their position in that company. | From the active positions. |
| **Company** (Add to another company) | Yes to Add | A company the person is not yet in. | Only companies they have not joined are offered. |
| **Role** (Add to another company) | No | The role they join that company with. | - |

## Tips & troubleshooting

- If you see "A user with this email already exists." the person already has an account; use **Invite collaborator** or **Add to another company** instead of creating a new user.
- If you see "That person isn't in your account yet. Use "Invite Collaborator" to invite them by email." the address you tried to add belongs to nobody in your organization; send an invitation.
- If you see "That person is already a collaborator on this company." or "An invitation is already pending for that email." nothing further is needed; check the person's card or the Pending Invitations list.
- If you see "Please choose a role." pick a role on the company row before clicking Update.
- If you see "Cannot remove the last Tenant Admin. Assign another Tenant Admin first." give someone else the Tenant Admin role in that company before removing or changing this person.
- If you see "This user also belongs to other accounts, so their profile can't be edited here." the person manages their own profile; you can still change their companies and roles.
- If you see "Another user already uses this email." choose a different address.
- If you see "Selected role / department / position does not belong to your account." reload the screen - the item was removed while the drawer was open.
- Invitations expire after 7 days; if someone did not accept in time, revoke the old invitation and send a new one.
- A person's role, department and position are per company: the same person can be a Manager in one club and a Supervisor in another.

## Related options

- **Role Management** (System Setup → Role Management) - defines the roles offered here.
- **Departments** and **Positions** (System Setup) - the placement lists offered here.
- **Companies** (System Setup → Companies) - the companies a person can be placed in.
- **Email Templates** (System Setup → Email Templates) - the wording of the collaborator invitation email.
- **Audit Log** (System Setup → Audit Log) - records every change made on this screen.
