# My Approvals

> **Where:** My Dashboard → **My tasks** card → **Open My Approvals to decide** (or any task line in that card); the screen is also reachable at `/approvals`.
>
> **Who can use it:** every signed-in user.
> The screen is personal: it lists only the approval tasks assigned to you in the company you are working in, and only you can decide them.

## What this option is for

My Approvals is your approval inbox.
When a colleague submits a document whose type goes through an approval chain (an invoice, a credit note, a refund, a deposit, a group booking, and so on), the chain's current step creates a task for each approver it resolves to, and that task lands here.
You read what was submitted, then **Approve** to move the document to the next step (or post it when you are the last step), or **Reject** with a reason that goes back to the submitter.
Staff come here when the bell shows a new task, when the **My tasks** card on My Dashboard lists something waiting, or when a submitter asks what is holding their document.
Approval chains themselves are designed under System Setup → Workflow Setup.

## The screen at a glance

[Screenshot: My Approvals list with two waiting tasks]

- A count line reads "**N waiting for you**".
- Each task is a card: the document (its number or label) as the title; underneath, the document type and the step ("Step 2: Finance Manager approval"); then **Submitted by** and **Submitted** (date and time).
- The chip top-right reads **Pending**, or **Overdue** (red) once the step's deadline has passed.
- Every card carries the visible **Approve** (green) and **Reject** (red) pair; there is no other row action.
- When nothing is assigned to you the screen shows "You're all caught up - nothing is waiting for your approval."
- Tasks are listed oldest first, so the document that has waited longest is at the top.

## Common tasks

### Approve a document

[Screenshot: Approve dialog with the optional comment]

1. Click **Approve** on the task.
2. The dialog is titled **Approve - <document>** and restates the document type, the step and who submitted it.
3. Optionally type a **Comment** for the approval history.
4. Click **Approve**.

A green message tells you what happened: "Approved. <document> moved to the next step." when another step follows, or "Approved. <document> is fully approved." when yours was the last decision needed.
The task leaves your inbox and the list refreshes.
Where several people were assigned to the same step, the step's rule decides whether your single approval completes it (first decision counts), whether everyone must approve, or how many approvals are enough.

### Reject a document

[Screenshot: Reject dialog with the required comment]

1. Click **Reject** on the task.
2. The dialog is titled **Reject - <document>**.
3. Type the **Comment**; it is compulsory on a rejection because the submitter needs to know why ("A comment is required when rejecting - the submitter needs to know why.").
4. Click **Reject**.

The message reads "Rejected. <document> was rejected."
The document goes back to its submitter as rejected, the whole chain stops, and every other approver's task for it closes.
The submitter corrects the document and submits it again, which starts a fresh chain.

### Back out of a decision

Click **Cancel**, the ✕ or press Esc.
If you had typed a comment, the system asks "Discard your decision?" and warns that the comment has not been submitted; choose to keep editing or to discard.

### Handle a task that has moved on

If a colleague decided the same step before you, or the submitter recalled the document, your decision is refused with "This approval has already moved on." or "This task has already been decided."
The dialog closes and the list refreshes by itself so the stale task disappears; nothing further is needed from you.

## Field reference

### Approve / Reject dialog

| Field | Required | What to enter | Rules |
| --- | --- | --- | --- |
| **Comment** | Only when rejecting | On an approval, an optional remark kept in the approval history. On a rejection, the reason the submitter will read, for example `Amount does not match the quotation`. | Free text; a rejection without a comment is refused. |

## Tips & troubleshooting

- If you see "A comment is required when rejecting - the submitter needs to know why." fill in the Comment before clicking Reject.
- If you see "This approval has already moved on." or "This task has already been decided." someone else acted first or the document was recalled; the list refreshes on its own.
- If you see "This task is not assigned to you." the task was reassigned or belongs to another person; refresh the list.
- If you see "Task not found." the task was removed (for example the document was cancelled); refresh the list.
- If you see "Failed to load your approvals." or "The decision could not be recorded." try again, and contact support if it persists.
- An **Overdue** chip means the step's deadline (set on the workflow) has passed; depending on the workflow you may already have received a reminder, or the document may be escalated to the next step and leave your inbox.
- The inbox is per company: switch company in the header to see tasks assigned to you there.
- The **My tasks** card on My Dashboard shows the same tasks with their due dates and a count, so you need not open this screen to know whether something is waiting.

## Related options

- **My Dashboard** (the home page) - the **My tasks** card that counts and lists your pending approvals and links here.
- **System Setup → Workflow Setup** - where administrators design the approval chains, their steps, deadlines and escalation.
- **Account Receivable → Invoices / Credit Notes / Debit Notes / Refunds / Deposits** and **Golf Management → Group Bookings** - the screens where documents are submitted into a chain and where the outcome shows.
