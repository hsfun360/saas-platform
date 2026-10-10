# Sales Agents

> **Where:** Membership Management → Sales Agents
>
> **Who can use it:** users whose role includes the Membership Management module.
> Your role's Create, Edit and Delete permissions decide which buttons you see; a button you are not allowed to use is simply not shown.

## What this option is for

The Sales Agents screen keeps everyone who promotes and sells your memberships: staff of an outsourced agency (**Agency staff**), freelance salespeople (**External individual**) and your own sales team (**Internal sales staff**).
A sales agent is picked on a membership as the agent who closed the sale and as the agent currently following up the member, and the Agent Performance insights report closings per agent and channel.
Each agent can be invited to their own portal login by email, where they see the clubs they serve.
Staff come here when a salesperson joins or leaves, to invite an agent to the portal, or to look up an agent's details.
The kinds offered depend on the sales channels enabled on the Club Specification.

## The screen at a glance

[Screenshot: Sales Agents list]

- Filter chips at the top: **All** plus one chip per enabled agent kind; clicking a chip reloads the list for that kind.
- A search box filters the loaded list as you type, matching the code, name, email, ID number and mobile.
- Each agent is a card: "code - name" as the title, a chip with the kind and, for agency staff, the agency name, then the email, mobile, joined date and **Portal** state (**Linked** or **Not registered**).
- A status chip top-right shows **Active** or **Disabled**.
- Each card has an **Edit** button and a ⋮ menu holding **Invite to login** (only for active agents not yet registered) and **Enable** or **Disable**.
- The **New agent** button floats at the bottom right of the screen.

## Common tasks

### Add a new agent

[Screenshot: New agent dialog]

1. Click **New agent**.
2. Enter the **Agent code** and **Name**, and pick the **Agent kind**.
   For **Agency staff**, also pick the **Agency**.
3. Enter the **Email** - it is where the login invitation will be sent.
4. Optionally fill the **Passport / ID number**, **Phone**, **Mobile**, **Joined date**, **Left date** and **Remarks**.
5. Click **Save**.

The agent appears in the list and can be picked on memberships.

### Invite an agent to their portal login

1. Open the card's ⋮ menu and click **Invite to login**.
2. The system emails a registration link to the agent's email address and confirms "Invitation sent to ...".

The agent follows the link to set a password; if they already have an account on the platform with that email, their existing login is linked without changing their password.
Once registered, the card shows **Portal: Linked** and the invite action disappears.
The link is valid for 30 days; send a new invitation if it expires.

### Edit an agent

1. Find the agent (use the filter chips and search box if the list is long) and click **Edit**.
2. Change what you need.
   Changing the kind away from Agency staff clears the agency link.
3. Click **Save**.

If you leave the dialog with unsaved changes (Cancel, ✕, Esc or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable an agent

- Open the card's ⋮ menu and click **Disable** when an agent leaves.
  Memberships they sold keep the link; the agent disappears from the membership pickers and cannot be invited.
- Open the ⋮ menu of a disabled agent and click **Enable** to bring them back.

Agents are never deleted, because memberships reference them.

## Field reference

### New agent / Edit agent dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Agent code** | Yes | A short code identifying the salesperson, e.g. `SA001`. | Up to 30 characters; must be unique within the company. |
| **Name** | Yes | The agent's full name. | Up to 255 characters. |
| **Agent kind** | Yes | **Agency staff**, **External individual** or **Internal sales staff**. Only the kinds enabled on the Club Specification are offered. | One of the enabled kinds. |
| **Agency** | Yes, for Agency staff | The agency the staff member belongs to; type to filter. | Must be an active agency; hidden for the other kinds. |
| **Email** | Yes | The agent's email - it receives the login invitation and identifies their portal account. | A valid email, up to 255 characters. |
| **Passport / ID number** | No | The agent's identity document number. | Up to 100 characters. |
| **Phone** / **Mobile** | No | Pick the country code, then type the number. | - |
| **Joined date** | No | When the agent started selling for the club; pick from the calendar. | - |
| **Left date** | No | When the agent stopped; pick from the calendar. | Must not be before the joined date. |
| **Remarks** | No | Any note about the agent. | Up to 2000 characters. |

## Tips & troubleshooting

- If you see "Agent 'X' already exists." another agent in this company already has that code.
- If you see "Select the agency this staff member belongs to." the kind is Agency staff but no agency is picked.
- If you see "Agency 'X' is disabled." enable the agency on Sales Agencies first, or pick another one.
- If you see "Email is required (it receives the login invitation)." or "A valid email is required" fill in a proper email address.
- If you see "Left date must be after the joined date." correct the two dates.
- If you see "This agent is already registered for the portal." the agent already has a linked login; nothing more to do.
- If you see "Enable the agent before inviting them." the agent is disabled; enable them from the ⋮ menu first.
- If you see "The invitation email template is disabled." ask your administrator to enable the sales-agent invitation template under the email templates.
- If you see "Your role's data scope does not allow amending this record." the agent was created by someone outside your data scope; ask your administrator.
- An agent who serves several clubs is created once per club with the same email; the portal shows all their engagements under one login.
- If a kind is missing from the chips and the dialog, it is switched off on Membership Management → Club Specification; agents of that kind already on record still show with their label.

## Related options

- Membership Management → Sales Agencies - the agencies that agency staff belong to.
- Membership Management → Club Specification - which sales channels are enabled.
- Membership Management → Memberships - the **Sales agent** and **Follow-up agent** pickers on a membership.
- Membership Management → Business Insights → Agent Performance - closings per channel and agent.
- System Setup → Email Templates - the sales-agent invitation email.
