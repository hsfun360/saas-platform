# Platform Users

> **Where:** SaaS Administration → Access → Platform Users (shown in the sidebar as **Users**)
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> **Create user** needs the Create permission, and **Edit** and **Activate/Deactivate** need the Edit permission; a role without a permission simply does not see that button.

## What this option is for

Platform Users are the people who work in the platform operator's own system workspace - the staff who administer subscribers, reference data and configuration, as opposed to the staff of a subscriber's club.
This screen creates and maintains those local sign-in accounts: email, password, name, phone and a short bio, and whether the account is active.
Creating a user here gives them a system workspace to log into but no permissions; what they may do is decided on the Assign Role screen, where a system role is granted to them.
Staff come here to onboard a new platform colleague, correct their details, or deactivate someone who has left.

## The screen at a glance

[Screenshot: Platform Users list]

- A search box filters the list as you type; it matches the email, the full name and the sign-in method (e.g. `google`).
- One card per user showing the email on the title line (with a Google or Microsoft logo in front of it when the person signs in with that provider) and the full name underneath.
- A status chip on the right shows **Active** (can sign in) or **Inactive** (sign-in blocked).
- Each card has an **Edit** button and a ⋮ menu holding **Activate** or **Deactivate**.
- The **Create user** button floats at the bottom right.

## Common tasks

### Create a platform user

[Screenshot: Create user dialog]

1. Click **Create user**.
2. Type the **Email** they will sign in with and their **Full Name**.
3. Type an initial **Password** of at least 6 characters and pass it to them securely; they can change it from their profile after signing in.
4. Optionally add a **Phone** (pick the country code, then type the number) and a **Bio**.
5. Click **Save**.

The new account is active immediately and appears in the list.
It holds no role yet: go to Assign Role to grant one, or the person will sign in to an empty workspace.

### Edit a user

[Screenshot: Edit user dialog]

1. Find the user and click **Edit**.
2. Change the **Email**, **Full Name**, **Phone** or **Bio**.
   The password cannot be changed here; the user resets it themselves with the forgot-password link.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Deactivate / activate a user

- Open the ⋮ menu on the card and click **Deactivate** to block the person from signing in to the platform workspace.
  Their account and history are kept; they are simply marked **Inactive**.
- Open the ⋮ menu and click **Activate** to let them sign in again.

You cannot deactivate your own account.

### Find a user

- Type part of an email, a name or a sign-in method in the search box.
- Click the ✕ in the search box, or **Clear search** on the "no matches" message, to see everyone again.

## Field reference

### User card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The sign-in email, preceded by the Google or Microsoft logo for accounts that sign in through that provider. |
| **Name line** | The full name. |
| **Status chip** | **Active** means the person can sign in; **Inactive** means sign-in is blocked. |

### Create user dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Email** | Yes | The address the person signs in with, e.g. `jane@example.com`. | Must be a valid email address, up to 255 characters, not already used by any account. |
| **Full Name** | Yes | The person's name as shown on screens and in the audit trail. | Up to 150 characters. |
| **Password** | Yes | The initial sign-in password. | At least 6 characters. |
| **Phone** | No | A contact number: pick the country code, then type the number. | - |
| **Bio** | No | A short note about the person or their responsibilities. | Up to 500 characters. |

### Edit user dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Email** | Yes | The sign-in address. | Must be a valid email address, up to 255 characters, not used by another account. |
| **Full Name** | Yes | The person's name. | Up to 150 characters. |
| **Phone** | No | A contact number. | - |
| **Bio** | No | A short note. | Up to 500 characters. |

## Tips & troubleshooting

- If you see "Email, password, and full name are required." fill in all three before saving.
- If you see "User with this email already exists." or "Another user already uses this email." the address is already registered - possibly as a subscriber's user; use a different address or edit the existing account.
- If you see "Enter a valid email address." or "Password must be at least 6 characters." correct the box with the message under it.
- If you see "You cannot deactivate your own account." ask another administrator to do it.
- If you see "Platform user not found." or "User not found." the account no longer exists; refresh the list.
- If you see "Failed to create user.", "Failed to update user." or "Failed to update user status." something went wrong on the server; try again, and contact support if it persists.
- Accounts that sign in with Google or Microsoft are created when the person first signs in that way, not here; you can still edit their name and deactivate them on this screen.
- Deactivate rather than expecting to delete: the person's actions in the audit trail must keep pointing at a real account.

## Related options

- **Assign Role** (SaaS Administration → Access → Assign Role) - grants a system role to a platform user; without one they can sign in but see nothing.
- **System Roles** (SaaS Administration → Access → System Roles) - defines the roles that Assign Role offers.
- **Unverified Registrations** (SaaS Administration → Access → Unverified Registrations) - self-registered accounts that never confirmed their email.
- **Audit Log** (SaaS Administration → Access → Audit Log) - the record of what each user changed.
