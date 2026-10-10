# Workflow Setup

> **Where:** System Setup → Workflow Setup
>
> **Who can use it:** users whose role includes the System Setup module (your organization's administrators, including the Tenant Admin).
> The New workflow, Edit and Enable/Disable controls only appear when the role also has the matching Create and Edit permissions on this screen.

## What this option is for

Workflow Setup is where you design approval chains for your documents - who must approve, in what order, and under what conditions.
Each workflow applies to one document type (for example AR invoices, credit notes, refunds, deposits or membership applications) and either to all your companies or to one company that needs its own chain.
A workflow is an ordered list of steps; each step names who approves (a role, a department and position, or a specific person), how many approvals are needed when several people qualify, an optional condition that skips the step when it is not met, and an optional deadline with a reminder or escalation.
When a document is submitted and an active workflow exists for its type, approvers receive a task in My Approvals (with an email and a bell notification) and the document is posted only once the chain approves it; rejection returns it to its author.
Documents of a type with no active workflow are approved automatically.
Staff come here when Finance or Membership wants a document type to go through approval, when approvers change, or when a chain should be switched off.

## The screen at a glance

[Screenshot: Workflow Setup list]

- A search box filters the list as you type; it matches the workflow name, the document type and the scope.
- Each workflow is a card showing its name as the title, with the document type, the scope (**All companies** or the company name) and its version underneath, plus the number of steps.
- A status chip at the top right of each card shows **Active** or **Disabled**; active workflows are listed first, by name.
- Each card has an **Edit** button and a **⋮** menu (More actions) holding **Preview** and **Enable** or **Disable**.
- The **New workflow** button sits at the bottom right of the screen.

## Common tasks

### Create an approval workflow

[Screenshot: New approval workflow dialog]

1. Click **New workflow**.
2. Choose the **Document type** and, under **Applies to**, leave **All companies** or pick one company.
3. Enter the **Workflow name** and optionally a **Description**.
4. Click **Add step** and fill in the step (see below); click **Add step** in the footer to return to the list of steps.
   Repeat for each step in the chain.
5. Drag the grip handle on a step to reorder; use a step's **Edit** button or its **⋮** menu's **Remove** to change or drop it.
6. Click **Save**.

The workflow is active immediately: new submissions of that document type now route through it.

### Define a step

[Screenshot: Add step view]

1. Enter the **Step name**, for example `Finance Manager approval`.
2. Under **Who approves**, choose one of:
   - **Anyone holding a role** - then pick the **Role**.
   - **A department (optionally one position)** - then pick the **Department** and, if only one level should approve, the **Position**.
   - **A specific person** - then pick the **Person**.
3. Under **When several people are assigned**, choose whether the first decision counts, all must approve, or a set number of approvals is enough (then enter **Approvals needed**).
4. Optionally tick **Only run this step under a condition** and set the **Field**, **Operator** and **Value** - for example only when the invoice amount is 5000 or more.
   When the condition is not met the step is skipped.
5. Optionally enter **If not decided within (hours)**.
   Without escalation, the pending approvers get one reminder (email and bell) when the deadline passes.
   Tick **Escalate to the next step** to close their tasks as escalated and hand the document to the next step instead; the last step always falls back to a reminder.
6. Click **Add step** (or **Update step** when editing).

Use **Back** to return to the workflow without keeping the step.

### Check who would receive each step (Preview)

[Screenshot: Preview view]

1. Open the workflow's **⋮** menu and click **Preview**.
2. The dialog lists each step with the names of the people who would be assigned if a document were submitted in your active company today.
   A step that matches nobody is flagged as one that would be skipped.
3. Click **Close**.

Use this after changing roles, departments or positions on User Management to confirm the chain still reaches someone.

### Edit a workflow

1. Find the workflow and click **Edit**.
2. Change the name, description, scope or steps; the document type is fixed once the workflow exists.
3. Click **Save**.

Approvals already in progress keep the chain they started with; the saved version number goes up and only new submissions use the new chain.
If you leave the dialog with unsaved changes (Cancel, ✕, Esc, or the browser back button), the system asks whether to discard your changes or keep editing.

### Disable / enable a workflow

- Open the card's **⋮** menu and click **Disable** to switch the chain off: new submissions of that document type are approved automatically, while running approvals finish unchanged.
- Open the **⋮** menu of a disabled workflow and click **Enable** to route new submissions through it again.

## Field reference

### New approval workflow / Edit dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Document type** | Yes | The kind of document the chain applies to, e.g. AR Invoice or Membership application. | One workflow per document type and scope; cannot be changed after creation. |
| **Applies to** | No | **All companies**, or one company whose own chain overrides the all-companies one. | Typing filters the company list; only a listed company can be chosen. |
| **Workflow name** | Yes | A name staff will recognise, e.g. `Membership application approval`. | Up to 255 characters. |
| **Description** | No | What the chain is for. | - |
| **Approval steps** | Yes (at least one) | The ordered steps; drag to reorder. | A workflow cannot be saved without a step. |

### Step view

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Step name** | Yes | What the step is, e.g. `Membership Manager approval`. | Up to 255 characters. |
| **Who approves** | Yes | **Anyone holding a role**, **A department (optionally one position)**, or **A specific person**. | Defaults to a role. |
| **Role** | Yes for a role step | The role whose holders in the company approve. | From Role Management. |
| **Department** | Yes for a department step | The department whose members approve. | From Departments. |
| **Position** | No | Narrow a department step to one position, or leave **Any position**. | From Positions. |
| **Person** | Yes for a person step | The specific user who approves. | From the people in your organization. |
| **When several people are assigned** | No | **First decision counts**, **All must approve**, or **A number of approvals is enough**. | Defaults to first decision counts. |
| **Approvals needed** | Yes when "a number" is chosen | How many approvals complete the step. | A whole number, 1 or more. |
| **Only run this step under a condition** | No | Tick to make the step conditional. | - |
| **Field / Operator / Value** | Yes when conditional | The document fact to test (for example the amount or the debtor type), the comparison (=, not equal, greater, greater or equal, less, less or equal, **is one of**), and the value. | A numeric field needs a number; **is one of** takes comma-separated values, e.g. `corporate, individual`. |
| **If not decided within (hours)** | No | The deadline for the step's approvers. | A whole number of hours, 1 or more; blank means no deadline. |
| **Escalate to the next step** | No | Tick to move the document to the next step when the deadline passes instead of reminding the same approvers. | Needs the hours deadline set; the last step always reminds. |

## Tips & troubleshooting

- If you see "Add at least one approval step before saving." add a step first.
- If you see "A workflow for this document type already exists for that scope. Edit it instead." open the existing workflow rather than creating a second one for the same type and scope.
- If you see "Pick the approving role.", "Pick the approving department." or "Pick the approving user." complete the approver choice for the step.
- If you see "Enter how many approvals are needed (1 or more)." fill in Approvals needed.
- If you see "Pick the condition field.", "Enter the condition value." or "The condition value must be a number." complete or correct the condition.
- If you see "Reminder must be a whole number of hours (1 or more)." or "Escalation needs the hours-pending deadline set." correct the deadline fields.
- If you see "That company is not part of your subscription." reload the screen and pick the company again.
- If a Preview shows "Nobody matches this rule in your active company", check User Management: the picked role, department or position is held by no one in that company, so the step would be skipped.
- Put a condition on the expensive approvals (for example a second signature only above an amount) rather than building two separate workflows.

## Related options

- **My Approvals** (My Dashboard → My tasks) - where approvers act on the tasks these workflows create.
- **Role Management**, **Departments**, **Positions** and **User Management** (System Setup) - the people and groupings a step can be routed to.
- **Email Templates** (System Setup → Email Templates) - the wording of the approval task and reminder emails.
- **AR Transactions** (Account Receivable) and **Memberships** (Membership Management) - the documents that are submitted for approval.
