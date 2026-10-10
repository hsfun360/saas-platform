# Subscriber Management

> **Where:** SaaS Administration → Subscriber Management
>
> **Who can use it:** platform (system) administrators whose role includes the SaaS Administration module.
> **New subscriber** needs the Create permission and **Edit** needs the Edit permission; a role without a permission simply does not see that button.

## What this option is for

A subscriber is a customer organisation that has signed up to the platform: it owns one or more companies (clubs), is on a subscription plan, and is entitled to a set of product modules.
This screen provisions new subscribers and manages the commercial side of each existing one - its name, registration number, plan, status (active or suspended) and primary company timezone.
It deliberately stops there: a subscriber's own preferences such as languages, currencies, reference data and users are managed by its Tenant Admin under System Setup, never from here.
The one exception is Tenant Admin recovery: when a club's Tenant Admin has left without a successor, you can hand the Tenant Admin role to another existing user of that company from this screen.
Staff come here to onboard a subscriber the sales team has signed, to suspend or reinstate one, to change its plan, or to recover a locked-out club.

## The screen at a glance

[Screenshot: Subscriber Management list]

- A search box filters the list as you type; it matches the subscriber name, plan, status and the first company's registration number.
- One card per subscriber showing its name on the title line, its registration number (in brackets) and plan badge on the sub-line, and a meta line with the number of companies and the creation date.
- A status chip on the right shows **ACTIVE** or **SUSPENDED**.
- Each card has an **Edit** button and a ⋮ menu holding **Manage Admin** (which becomes **Close** while its panel is open).
- The **New subscriber** button floats at the bottom right.

## Common tasks

### Provision a new subscriber

[Screenshot: New subscriber dialog]

1. Click **New subscriber**.
2. Enter the first Tenant Admin's **Email**, **Full Name**, **Password** and **Confirm Password**.
   This person becomes the owner of the new subscriber and the Tenant Admin of its first company; pass the password to them securely.
3. Type the **Subscriber / Company Name**, e.g. `Tropicana Golf & Country Resort`, and optionally the **Registration No.** and **Phone No.**.
4. Choose the **Subscription Plan** (BASIC, PRO or ENTERPRISE).
5. Under **Subscribed Modules**, untick any product module the subscriber is not entitled to; all are ticked to start with.
   Platform-only modules are never offered here.
6. Click **Save**.

A green message confirms, e.g. "Subscriber "Tropicana Golf & Country Resort" (admin@example.com) created with 4 module(s)!".
The system creates the owner's account (already verified, no activation email), the subscriber record, its first company with the same name, the Tenant Admin role, and the module entitlements, all in one step.
The owner can sign in straight away and continue setup under System Setup.

### Edit a subscriber

[Screenshot: Edit subscriber dialog]

1. Find the subscriber and click **Edit**.
2. Change the **Subscriber / Company Name**, **Registration No.**, **Subscription Plan**, **Status** or **Timezone**.
   Registration number and timezone belong to the subscriber's first (oldest) company; the other companies are managed by the Tenant Admin.
3. Click **Save**.

If you try to leave either dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Suspend or reinstate a subscriber

1. Click **Edit** on the subscriber.
2. Set **Status** to SUSPENDED to suspend, or ACTIVE to reinstate.
3. Click **Save**.

### Recover a company's Tenant Admin (Manage Admin)

[Screenshot: Manage Admin panel inside a subscriber card]

1. Open the ⋮ menu on the subscriber card and click **Manage Admin**; a panel opens inside the card.
2. If the subscriber has more than one company, click the company whose Tenant Admin you need to change; the panel lists that company's users with their current role.
   The current Tenant Admin is marked with a tick.
3. Click **Set as Admin** next to the user who should take over.
4. A confirmation states "Transfer Tenant Admin to name@example.com? This removes admin rights from the current Tenant Admin."; click **Transfer**.
5. A green message confirms "Tenant Admin transferred successfully." and the list refreshes.
6. Open the ⋮ menu and click **Close** to fold the panel.

Only people who are already users of that company can be chosen; adding someone to a company is done by the subscriber under User Management.

### Find a subscriber

- Type part of a name, plan, status or registration number in the search box.
- Click the ✕ in the search box, or **Clear search** on the "no matches" message, to see everyone again.

## Field reference

### Subscriber card (read-only)

| Field | What it shows |
| --- | --- |
| **Title line** | The subscriber name. |
| **Sub-line** | The first company's registration number in brackets, and the plan badge (BASIC, PRO or ENTERPRISE). |
| **Meta line** | Companies - how many companies the subscriber has; Created - when it was provisioned. |
| **Status chip** | **ACTIVE** or **SUSPENDED**. |

### New subscriber dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Email** | Yes | The sign-in address of the subscriber's first Tenant Admin. | Must be a valid email address, up to 255 characters, not already registered. |
| **Full Name** | Yes | The Tenant Admin's name. | Up to 150 characters. |
| **Password** | Yes | The Tenant Admin's initial password. | At least 6 characters. |
| **Confirm Password** | Yes | The same password again. | Must match Password. |
| **Subscriber / Company Name** | Yes | The organisation's name; it becomes both the subscriber name and the name of its first company. | Up to 200 characters. |
| **Registration No.** | No | The company registration number, e.g. `202501000001`. | Up to 100 characters. |
| **Subscription Plan** | Yes | BASIC, PRO or ENTERPRISE. | Defaults to BASIC. |
| **Phone No.** | No | The Tenant Admin's contact number: pick the country code, then type the number. | - |
| **Subscribed Modules** | No | The product modules the subscriber is entitled to; tick or untick each. | All ticked by default; platform-only modules are not offered. |

### Edit subscriber dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Subscriber / Company Name** | Yes | The organisation's name. | Up to 200 characters. |
| **Registration No.** | No | The first company's registration number. | Up to 100 characters; clear it to remove. |
| **Subscription Plan** | Yes | BASIC, PRO or ENTERPRISE. | - |
| **Status** | Yes | ACTIVE or SUSPENDED. | - |
| **Timezone** | No | The first company's timezone, e.g. `Asia/Kuala_Lumpur (UTC +08:00)`; type to search. | Up to 100 characters; clearing it keeps the company's existing timezone. |

### Manage Admin panel

| Control | What it does |
| --- | --- |
| **Company buttons** | Shown when the subscriber has several companies; pick the company whose Tenant Admin to manage. |
| **User rows** | Each user of the chosen company with their current role; the current Tenant Admin is ticked. |
| **Set as Admin** | Transfers the Tenant Admin role to that user after confirmation. |

## Tips & troubleshooting

- If you see "Email, password, full name, and company name are required." fill in those boxes.
- If you see "Passwords do not match." retype Confirm Password.
- If you see "A user with this email already exists." the Tenant Admin's address is already registered; use another address, or have that person added to the company after provisioning.
- If you see "Subscriber / Company name is required." the name was cleared; type it back in.
- If you see "This subscriber has no company to manage." there is nothing to recover; the subscriber has no company yet.
- If you see "No users in this company yet." nobody can be made Tenant Admin until the subscriber adds users under their own User Management.
- If you see "User is not a member of this company." the person was removed from the company before you clicked; reopen the panel.
- If you see "Failed to create subscriber.", "Failed to update subscriber." or "Failed to set Tenant Admin." something went wrong on the server; try again, and contact support if it persists.
- Module entitlements after provisioning are edited per company by the Tenant Admin under System Setup → Companies, not here.
- Suspending a subscriber is the right way to pause a non-paying customer; nothing is deleted and reinstating is one edit.

## Related options

- **Tenant Modules & Menus** (SaaS Administration → Configuration → Tenant Modules & Menus) - defines the modules offered under Subscribed Modules.
- **Companies** (System Setup → Companies, used by Tenant Admins) - where a subscriber manages its companies and their modules.
- **User Management** (System Setup → User Management, used by Tenant Admins) - where a subscriber adds the people who can be chosen under Manage Admin.
- **Audit Log** (SaaS Administration → Access → Audit Log) - records every change made here, including Tenant Admin transfers.
