# Workflow (approval chains)

The shared approval-chain capability: a subscriber defines WHO must approve WHICH document type, and the producing module routes its documents through the chain at submit time.
Same tier as Tax and Dimension - owned by no product, consumed by several through a seam.

- **Module folder:** `src/modules/workflow`
- **Gateway base:** `/api/workflow`
- **Schema:** `workflow` (registered in `platform/schemas.js`)
- **Seams:**
  - `platform/workflowGateway.js` - producers -> Workflow (`hasActiveWorkflow`, `previewChain`, `startWorkflow`, `cancelForEntity`).
  - `src/modules/workflow/purposeRegistry.js` + `src/wiring/workflowHandlers.js` - Workflow -> producers (completion callbacks registered at composition time, never a reverse `require()`).
  - `serviceContext.resolveApprovers` / `listApproverOptions` - approver rules resolve against Control-Plane org data through the seam.
- **Entitlement:** none - the designer gates on the Workflow Setup menu (`requireMenuAction('/admin/workflows')`); the inbox, act and history endpoints gate on a valid token only (a task is addressed to its assignee personally, enforced in the engine).
- **Request validation:** every route that reads a request part mounts `validate()` with a schema from `workflow.schemas.js` (mounted 2026-10-12); the controller and engine keep every business check.

## Purposes (`workflow.constants.js`)

A purpose is one document type that can route through approval.
It appears here BEFORE its producing module is wired, so a subscriber can set the chain up first; the gateway simply finds no active definition until then and the document auto-approves.

| Purpose | Entity type | Document route | Producer wired? |
| --- | --- | --- | --- |
| `membership-application` | `Membership` | `/membership/memberships` | No - purpose declared, no handler, the Membership submit flow is not routed through the gateway yet. |
| `ar-invoice` | `ArInvoice` | `/ar/invoices` | Yes (2026-08-13, the first producer). |
| `ar-debit-note` | `ArDebitNote` | `/ar/debit-notes` | Yes (2026-09-01). |
| `ar-credit-note` | `ArCreditNote` | `/ar/credit-notes` | Yes (2026-08-20). |
| `ar-refund` | `ArRefund` | `/ar/refunds` | Yes (2026-08-31). |
| `ar-deposit` | `ArDeposit` | `/ar/deposits` | Yes (2026-09-01). |
| `golf-group-booking` | `GolfGroupBooking` | `/golf/group-bookings` (+ `entityRouteParam`, so the outcome bell opens the booking's own page) | Yes (2026-10-11). |

Each purpose declares `contextFields`: what the producer passes as the instance context and what step conditions may test (e.g. `amount`, `debtorType`, `debtorNo`; the group booking passes the tee-sheet consumption and pricing figures an approver decides on).

Other vocabularies: `APPROVER_TYPES` = `role | department-position | user`; `APPROVAL_MODES` = `any | all | count`; `CONDITION_OPS` = `eq | ne | gt | gte | lt | lte | in`; `INSTANCE_STATUSES` = `in-progress | approved | rejected | cancelled`; `TASK_STATUSES` = `pending | approved | rejected | superseded | cancelled | escalated`.

## Owns (data)

All tables live in the `workflow` schema.
Definition/steps and instance/tasks are intra-service header/detail pairs (real FKs, cascade); account, company, role, department, position, user and entity references are plain UUIDs (no FK).

- `WorkflowDefinition` - a subscriber's chain for one purpose: `accountId`, `companyId` (NULL = account-wide; a company-specific row overrides it), `purpose`, `name`, `description`, `version` (bumped on every edit), `isActive` (inactive = documents of that purpose auto-approve), stamps.
  SUBSCRIBER-owned by design: there is no platform NULL-account row, because approver rules point at the subscriber's own roles, departments and users.
  Unique per `(accountId, purpose, companyId)` plus a partial unique on the account-wide `(accountId, purpose)` subset.
  Rows are edited IN PLACE; running instances never read them again.
- `WorkflowStep` - one ordered step of a definition: `definitionId`, `stepNo`, `name`, `approverType`, `approverRoleId` / `approverDepartmentId` + `approverPositionId` (position NULL = anyone in the department) / `approverUserId`, `approvalMode`, `requiredApprovals` (for `count`), `condition` (`{ field, op, value }` JSONB against the instance context; false = the step is SKIPPED; NULL = always runs), `slaHours`, `escalateOnSla`, stamps.
  Unique `(definitionId, stepNo)`.
- `WorkflowInstance` - one running or finished approval per document: `accountId`, `companyId`, `definitionId`, `definitionVersion`, `purpose`, `entityType`, `entityId`, `entityLabel` (frozen display), `status`, `currentStepNo` (NULL once terminal), `definitionSnapshot` (the definition + ordered steps frozen at start - editing a definition never mutates an approval in flight), `context` (JSONB), `completedAt`, stamps.
  `createdBy` IS the submitter and `createdAt` the submit time.
  The partial unique `IDX_WorkflowInstance_Entity_Live` on `(entityType, entityId) WHERE status = 'in-progress'` guarantees one live approval per document, so a double-submit race dies at the constraint.
- `WorkflowTask` - one row per assignee per ACTIVATED step: `instanceId`, `accountId`, `companyId` (denormalized for the inbox query), `stepNo`, `stepName`, `assigneeUserId`, `status`, `actedAt`, `comment` (required on reject), `dueAt` (activation + `slaHours`), `remindedAt` (set once, so a reminder never repeats), stamps (`updatedBy` = the actor).
  Rows are never deleted - they are the approval audit trail rendered on the document screen.
  Indexes: `(assigneeUserId, status)` for My Approvals, `(instanceId, stepNo)`, and a partial `(status, dueAt) WHERE remindedAt IS NULL` for the SLA scan.

## The engine (`workflowEngine.js`)

Every entry point performs ONE small state transition inside the caller's transaction (row writes + outbox enqueue); the engine never does slow or fan-out work in-request.
Transitions lock the instance row (`SELECT ... FOR UPDATE`).

- `findActiveDefinition(accountId, companyId, purpose)` - the company-specific definition wins over the account-wide one; a chain with no steps enforces nothing.
- `previewChain(...)` - the chain a submit WOULD take for a context, approver names resolved now (show-expected-results for the producer's confirm dialog); null = no chain.
- `startWorkflow({ ... })` - creates the instance, freezes the snapshot, activates the first applicable step.
  A chain whose every step is skipped (conditions unmet, or approvers resolving to nobody) completes `approved` ON ARRIVAL; the gateway then returns `null` to the producer so it proceeds as auto-approved while the instance row remains as the audit record (fix 2026-09-01 for a Deposit stranded at pending-approval).
- `activateNextStep(instance, fromStepNo, tx)` - the first snapshot step after `fromStepNo` whose condition passes: resolve the assignees (at activation, so staff changes are picked up), fan out one task per person with `dueAt`, queue the `workflow.task.assigned` email and a `workflow-task` bell per approver (both never abort the transaction).
  A passing step that resolves to nobody is skipped with a warning - a stalled invisible approval is worse than a skipped step.
- `actOnTask({ taskId, userId, decision, comment })` - the assignee acts on their own task under the instance lock.
  One rejection rejects the document (outstanding tasks `cancelled`).
  An approval re-counts the step's quorum (`any` = 1, `all` = every task, `count` = `requiredApprovals` capped at the task count); once met, siblings that never acted become `superseded` and the next step activates, or the instance completes `approved`.
  Stale or foreign tasks return `{ error, stale | forbidden }`.
- `cancelInstance` / `cancelForEntity` - the submitter recalls (only the submitter may), or the producing module withdraws the document: pending tasks `cancelled`, instance `cancelled`.
- `completeInstance(instance, outcome, tx)` - flips the instance terminal, calls the producer's registered handler (`onApproved` / `onRejected` / `onCancelled`) INSIDE the same transaction, then queues the submitter's `workflow.completed` email and `workflow-outcome` bell (not for a self-inflicted cancel; the bell links to the purpose's `documentRoute`, with the entity id appended when `entityRouteParam` is set).
- `evalCondition(condition, context)` - a missing field or unknown op evaluates FALSE (the step is skipped); numeric comparison when both sides parse as numbers; `in` accepts a list.

## SLA reminders and escalation (`workflow.reminders.js`)

The ONE piece of time-driven work, run by the outbox worker (every 5 minutes in poll mode, on every scheduler sweep in drain mode - see [notification.md](notification.md)), never in an API request.
It claims up to 20 pending tasks past their `dueAt` with `FOR UPDATE SKIP LOCKED`, grouped per instance step:

- `escalateOnSla = false` -> exactly one REMINDER to the same approvers: `workflow.task.reminder` email + `workflow-task` bell, `remindedAt` set in the same transaction.
- `escalateOnSla = true` -> ESCALATE: the step's pending tasks flip to `escalated` and the NEXT step activates (its approvers get the normal assignment email + bell); the LAST step falls back to the reminder because nobody is above it.
  Each escalated-to step carries its own `slaHours`, so a chain can climb level by level.
- An instance that moved on marks its stale tasks reminded so they stop matching the scan.

## Completion handlers (`src/wiring/workflowHandlers.js`)

Registered once from `app.js` through `purposeRegistry.register(purpose, { onApproved, onRejected, onCancelled })`.
Rules (2026-07-22 execution-flow agreement): a handler runs INSIDE the completing request's transaction and flips the document's status and nothing else heavy; anything slow or fan-out is enqueued to the outbox from the handler.

- `ar-invoice`, `ar-credit-note`, `ar-debit-note` (one factory): `onApproved` posts the draft through `arPosting.postDraftLedger` with the number issued by `numberingGateway.issueNumberForCompany` (req-less); `onRejected` / `onCancelled` flip the row back to `draft` and keep the `ar.TaxLedger` status mirror in step.
  A row already handled or voided out-of-band is ignored - never fail the approval.
- `ar-refund`: `onApproved` posts through `arPosting.postDraftRefund` (resolving the stored intent - deposit payout, excess credit, or the deposit-to-outstanding offset with its Credit Note leg), REFUSING if the funding no longer covers; rejection/recall return the draft.
- `ar-deposit`: `onApproved` flips the draft open through `arPosting.postDraftDeposit`; rejection/recall return the draft.
- `golf-group-booking`: `onApproved` -> `groupLifecycle.applyApproval` (snapshots the deposit demand and starts its clock, or confirms outright); `onRejected` -> `applyRejection` (back to tentative with the flights RELEASED); `onCancelled` -> `applyRecall` (back to tentative with everything kept and the hold clock restarted).

A purpose with no handler is legal: the instance still completes and the document screen shows the outcome through the history endpoint.

## Public API (gateway seam `/api/workflow`)

- `GET /health` - liveness (unauthenticated).
- Designer, behind `requireMenuAction('/admin/workflows')`:
  `GET /meta` (purposes, approver types, approval modes, condition ops, the subscriber's companies and the approver-picker option lists from `listApproverOptions`), `GET /definitions`, `POST /definitions` (header + steps, re-numbered from array order), `PATCH /definitions/:id` (presence semantics; steps replaced wholesale and `version` bumped), `GET /definitions/:id/preview`.
- My Approvals inbox (valid token; assignee-personal):
  `GET /my-tasks` (pending tasks of the caller in the active company with submitter names), `GET /my-tasks/count`, `POST /tasks/:id/approve` and `POST /tasks/:id/reject` `{ comment }` (the engine enforces ownership and quorum).
- Per-document history + recall (valid token):
  `GET /instances?entityType=&entityId=` (every instance of the document with its task trail, newest first), `POST /instances/:id/cancel` (submitter recall).

## Producer contract (`platform/workflowGateway.js`)

- `hasActiveWorkflow(req, purpose)` - whether to label the button "Submit for Approval" vs "Submit".
- `previewChain(req, purpose, context)` - the pre-submit confirmation's chain.
- `startWorkflow(req, purpose, { entityId, entityLabel, context, transaction })` - runs INSIDE the producer's business transaction; `null` = no chain (or every step skipped) -> the producer treats the document as auto-approved and proceeds; otherwise `{ instanceId, status, currentStepNo }` and the producer marks its document `pending-approval` with the `workflowInstanceId`.
- `cancelForEntity(entityType, entityId, transaction)` - when the producer withdraws or deletes the document.

Boot healer (outside the fingerprint gate, `app.js`): an AR Ledger, Receipt or Deposit still at `pending-approval` whose instance is no longer `in-progress` is reverted to `draft` so it can be resubmitted.

## Depends on

- Identity (JWT verify; submitter and approver names by `userId`).
- Control Plane (approver resolution through `serviceContext.resolveApprovers`; the `/admin/workflows` menu grant).
- Notification (outbox): `workflow.task.assigned`, `workflow.task.reminder`, `workflow.completed` emails and the `workflow-task` / `workflow-outcome` bells through `notificationGateway.notifyUser`.

## Consumed by

- Account Receivable (invoice, debit note, credit note, refund, deposit submit doors) and Golf (group booking submit, recall, reopen) through the gateway.
- Membership: the `membership-application` purpose is declared and the `approvalStatus` column exists, but nothing routes through the gateway yet.

## Web

- `/admin/workflows` (Workflow Setup, System Setup tier) - the designer.
- `/approvals` - My Approvals inbox and the per-document history panel the document screens embed.
