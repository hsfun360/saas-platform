// Fixed domain vocabularies for the Account Receivable service.
//
// Values are stored as stable keys; the UI maps keys to display labels. These
// lists are the single source of truth: the API validates against them AND
// serves them to the screens' dropdowns, so the two never drift.

// What a Debtor ledger account represents (where sourceId points).
//   membership - the contract debtor (Membership id): membership fee, own
//                subscription, nominee subscriptions the company bears.
//   member     - a personal debtor (Member id): a nominee's own frontend
//                charges/subscription. Individual memberships do NOT get one -
//                their contract debtor carries everything. Dependents never
//                get a debtor row (their charges land on the principal).
//   other      - a city-ledger debtor owned by AR itself (OtherDebtor id).
const DEBTOR_TYPES = [
    { key: 'membership', label: 'Membership' },
    { key: 'member', label: 'Member' },
    { key: 'other', label: 'Other Debtor' },
];

// Ledger-account lifecycle. Suspended blocks new postings but keeps the
// account visible; closed is terminal (zero balance, kept for history).
const DEBTOR_STATUSES = [
    { key: 'active', label: 'Active' },
    { key: 'suspended', label: 'Suspended' },
    { key: 'closed', label: 'Closed' },
];

const DEBTOR_TYPE_KEYS = DEBTOR_TYPES.map((t) => t.key);
const DEBTOR_STATUS_KEYS = DEBTOR_STATUSES.map((s) => s.key);

module.exports = { DEBTOR_TYPES, DEBTOR_STATUSES, DEBTOR_TYPE_KEYS, DEBTOR_STATUS_KEYS };
