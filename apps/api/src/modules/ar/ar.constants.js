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

// --- Document ledger (slice 2) ---

// Ledger documents (open-item side). mode is FIXED per kind except the
// invoice void-reversal (an invoice row with mode 'credit' + reversalOfId).
const LEDGER_DOC_KINDS = [
    { key: 'invoice', label: 'Invoice', mode: 'debit', numberingPurpose: 'ar-invoice' },
    { key: 'debit-note', label: 'Debit Note', mode: 'debit', numberingPurpose: 'ar-debit-note' },
    { key: 'credit-note', label: 'Credit Note', mode: 'credit', numberingPurpose: 'ar-credit-note' },
];

// Money-movement documents.
const RECEIPT_DOC_KINDS = [
    { key: 'receipt', label: 'Official Receipt', mode: 'credit', numberingPurpose: 'ar-receipt' },
    { key: 'refund', label: 'Refund', mode: 'debit', numberingPurpose: 'ar-refund' },
];

const DEPOSIT_NUMBERING_PURPOSE = 'ar-deposit';

// Where a ledger document originated.
const SOURCE_MODULES = ['membership', 'golf', 'pos', 'facility', 'ar'];

// The allocation web's valid (creditDocType -> debitDocType) pairs. There is
// deliberately NO deposit->ledger pair (deposit-to-outstanding = the CN
// conversion process).
const ALLOCATION_PAIRS = [
    { from: 'receipt', to: 'ledger' },   // payment settles Invoice/DN
    { from: 'ledger', to: 'ledger' },    // CN / void reversal offsets a debit
    { from: 'receipt', to: 'deposit' },  // deposit collection
    { from: 'deposit', to: 'refund' },   // deposit refund
    { from: 'receipt', to: 'refund' },   // overpayment refund
];

const LEDGER_DOC_KIND_KEYS = LEDGER_DOC_KINDS.map((k) => k.key);
const RECEIPT_DOC_KIND_KEYS = RECEIPT_DOC_KINDS.map((k) => k.key);

module.exports = {
    DEBTOR_TYPES,
    DEBTOR_STATUSES,
    DEBTOR_TYPE_KEYS,
    DEBTOR_STATUS_KEYS,
    LEDGER_DOC_KINDS,
    LEDGER_DOC_KIND_KEYS,
    RECEIPT_DOC_KINDS,
    RECEIPT_DOC_KIND_KEYS,
    DEPOSIT_NUMBERING_PURPOSE,
    SOURCE_MODULES,
    ALLOCATION_PAIRS,
};
