// src/modules/workflow/workflow.constants.js
//
// The Workflow service's owned vocabularies: purposes (which document types can
// route through an approval chain), statuses, approver rule types, quorum modes
// and condition operators. Screens read these via GET /api/workflow/meta; the
// API validates against them. Approved table spec: 2026-07-22.

// The document types that can route through approval. `entityType` is the
// value stamped on instances; `contextFields` documents what the producing
// module passes as the instance context (and what step conditions may test).
// A purpose appears here BEFORE its producing module is wired, so subscribers
// can set the chain up first (the gateway simply finds no active definition
// until then and the document auto-approves).
const PURPOSES = [
    // `documentRoute` = where the submitter's outcome notification links to
    // (the document's own screen); approver notifications link to /approvals.
    {
        key: 'membership-application',
        name: 'Membership application',
        entityType: 'Membership',
        documentRoute: '/membership/memberships',
        contextFields: [
            { name: 'amount', label: 'Entrance fee amount', type: 'number' },
            { name: 'membershipClass', label: 'Membership class (individual | corporate)', type: 'string' },
        ],
    },
    // First wired producer (2026-08-13): submitting an AR invoice draft routes
    // here when a chain is active; approval posts the draft, rejection returns
    // it to Open (editable).
    {
        key: 'ar-invoice',
        name: 'AR Invoice',
        entityType: 'ArInvoice',
        documentRoute: '/ar/invoices',
        contextFields: [
            { name: 'amount', label: 'Invoice gross amount', type: 'number' },
            { name: 'debtorType', label: 'Debtor type (membership | member | other)', type: 'string' },
            { name: 'debtorNo', label: 'Debtor number', type: 'string' },
        ],
    },
    // Credit Note adopted the same lifecycle 2026-08-20: approval posts the
    // draft (resolving its stored allocation intent), rejection returns it
    // to Open.
    {
        key: 'ar-credit-note',
        name: 'AR Credit Note',
        entityType: 'ArCreditNote',
        documentRoute: '/ar/credit-notes',
        contextFields: [
            { name: 'amount', label: 'Credit note gross amount', type: 'number' },
            { name: 'debtorType', label: 'Debtor type (membership | member | other)', type: 'string' },
            { name: 'debtorNo', label: 'Debtor number', type: 'string' },
        ],
    },
];
const PURPOSE_KEYS = PURPOSES.map((p) => p.key);

// Step approver rule types.
const APPROVER_TYPES = ['role', 'department-position', 'user'];

// Step quorum modes: first decision wins | everyone must approve | N approvals.
const APPROVAL_MODES = ['any', 'all', 'count'];

// Condition operators for a step's entry condition ({ field, op, value }).
const CONDITION_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'];

// Instance lifecycle. 'cancelled' = the submitter recalled it before completion.
const INSTANCE_STATUSES = ['in-progress', 'approved', 'rejected', 'cancelled'];

// Task lifecycle. 'superseded' = a sibling's decision completed the step first
// ('any' / satisfied 'count'); 'cancelled' = the instance ended upstream;
// 'escalated' = the step's SLA passed with escalateOnSla and the chain moved
// to the next step (the task can no longer be acted on).
const TASK_STATUSES = ['pending', 'approved', 'rejected', 'superseded', 'cancelled', 'escalated'];

module.exports = {
    PURPOSES,
    PURPOSE_KEYS,
    APPROVER_TYPES,
    APPROVAL_MODES,
    CONDITION_OPS,
    INSTANCE_STATUSES,
    TASK_STATUSES,
};
