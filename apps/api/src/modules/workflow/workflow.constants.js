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
    // Debit Note closed the ledger set 2026-09-01: same lifecycle as the
    // invoice (a DN charges the debtor more), approval posts, rejection
    // returns to Open.
    {
        key: 'ar-debit-note',
        name: 'AR Debit Note',
        entityType: 'ArDebitNote',
        documentRoute: '/ar/debit-notes',
        contextFields: [
            { name: 'amount', label: 'Debit note gross amount', type: 'number' },
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
    // Refunds route through approval because they move money OUT (refund
    // slice 2026-08-31): approval posts the draft (funding resolved then -
    // deposit payout, excess-credit payout, or deposit-to-outstanding offset),
    // rejection returns it to Open.
    {
        key: 'ar-refund',
        name: 'AR Refund',
        entityType: 'ArRefund',
        documentRoute: '/ar/refunds',
        contextFields: [
            { name: 'amount', label: 'Refund amount', type: 'number' },
            { name: 'refundMode', label: 'Refund mode (deposit | credit | offset)', type: 'string' },
            { name: 'debtorType', label: 'Debtor type (membership | member | other)', type: 'string' },
            { name: 'debtorNo', label: 'Debtor number', type: 'string' },
        ],
    },
    // Deposit slice 2026-09-01: opening a deposit is a billing act (a demand
    // for collateral, like an invoice demands payment), so it can route
    // through approval the same way; approval posts the draft, rejection
    // returns it to Open.
    {
        key: 'ar-deposit',
        name: 'AR Deposit',
        entityType: 'ArDeposit',
        documentRoute: '/ar/deposits',
        contextFields: [
            { name: 'amount', label: 'Required deposit amount', type: 'number' },
            { name: 'debtorType', label: 'Debtor type (membership | member | other)', type: 'string' },
            { name: 'debtorNo', label: 'Debtor number', type: 'string' },
        ],
    },
    // Group / tournament booking (user decisions 2026-10-11): with Group
    // booking control ON, Submit routes the TENTATIVE booking here; approval
    // starts the deposit clock (or confirms when nothing is owed), rejection
    // returns it to tentative with its flights released. The context carries
    // the tee-sheet consumption and the pricing an approver decides on.
    // `entityRouteParam` appends the booking id to documentRoute so the
    // outcome bell opens the booking's own page.
    // Affiliated / reciprocal club visit (user decisions 2026-10-15): a visit
    // request from a club or player type that requires approval routes here
    // on Confirm; approval confirms and books it, rejection declines it.
    {
        key: 'golf-affiliated-visit',
        name: 'Golf affiliated visit',
        entityType: 'GolfAffiliatedVisit',
        documentRoute: '/golf/affiliated-visits',
        entityRouteParam: true,
        contextFields: [
            { name: 'clubKind', label: 'Arrangement (affiliate | reciprocal)', type: 'string' },
            { name: 'clubCode', label: 'Affiliated club code', type: 'string' },
            { name: 'dayType', label: 'Day type of the visit (weekday | weekend)', type: 'string' },
            { name: 'playerCount', label: 'Golf party size', type: 'number' },
            { name: 'guestCount', label: 'Guests in the party', type: 'number' },
            { name: 'visitsThisPeriod', label: 'Visits by this member in the cap period, this one included', type: 'number' },
            { name: 'facilities', label: 'Facilities requested (golf | dining | accommodation | other, comma separated)', type: 'string' },
        ],
    },
    {
        key: 'golf-group-booking',
        name: 'Golf group booking',
        entityType: 'GolfGroupBooking',
        documentRoute: '/golf/group-bookings',
        entityRouteParam: true,
        contextFields: [
            { name: 'bookingType', label: 'Booking type (group | tournament)', type: 'string' },
            { name: 'dayType', label: 'Day type of the play days (weekday | weekend - any weekend or holiday day counts)', type: 'string' },
            { name: 'playDays', label: 'Number of play days', type: 'number' },
            { name: 'totalFlights', label: 'Reserved flights (all days)', type: 'number' },
            { name: 'totalSeats', label: 'Reserved seats (all days)', type: 'number' },
            { name: 'maxDaySharePct', label: 'Highest share of a day\'s tee times this booking takes (%)', type: 'number' },
            { name: 'groupSharePct', label: 'Highest share of a day\'s tee times held by ALL groups after this booking (%)', type: 'number' },
            { name: 'startFormat', label: 'Start format (sequential | shotgun - any shotgun day counts)', type: 'string' },
            { name: 'amount', label: 'Group bill total', type: 'number' },
            { name: 'catalogAmount', label: 'Catalog value of the same lines (manual prices re-quoted from the rate card)', type: 'number' },
            { name: 'discountPct', label: 'Discount against catalog (%)', type: 'number' },
            { name: 'manualPriceCount', label: 'Bill lines with a manually keyed price', type: 'number' },
            { name: 'perPlayerAmount', label: 'Bill total per expected player', type: 'number' },
            { name: 'depositRequired', label: 'Deposit demanded', type: 'number' },
            { name: 'depositPct', label: 'Deposit demanded as % of the bill total', type: 'number' },
            { name: 'organiserType', label: 'Organiser account (city-ledger | member | cash)', type: 'string' },
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
