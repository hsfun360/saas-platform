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
// Labels are the user-facing vocabulary (standard 2026-08-20): a 'member'
// ledger account only ever belongs to a NOMINEE (individual members share the
// membership debtor, dependents never get one), so it reads "Nominee".
const DEBTOR_TYPES = [
    { key: 'membership', label: 'Membership' },
    { key: 'member', label: 'Nominee' },
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

// --- Transaction Type catalog (AR-owned since 2026-08-15) ---

// Which document book a Transaction Type belongs to. Each entry screen
// filters its own class; 'receipt' = debtor payment (collection) methods and
// 'refund' = refund methods - SPLIT 2026-08-20 (user rule): collection and
// refund are separate menus/grants, and refunds may require workflow approval
// while receipts do not, so their vocabularies must be separately grantable.
// 'deposit' = deposit BILLING; 'forex' is the future slot for exchange
// gain/loss on foreign-currency receipts.
const TRX_CLASSES = [
    { key: 'invoice', label: 'Invoice' },
    { key: 'debit-note', label: 'Debit Note' },
    { key: 'credit-note', label: 'Credit Note' },
    { key: 'interest', label: 'Interest' },
    { key: 'deposit', label: 'Deposit' },
    { key: 'receipt', label: 'Receipt' },
    { key: 'refund', label: 'Refund' },
    { key: 'forex', label: 'Forex' },
];

// Payment-method classes (money movement, not billing): no tax scheme, no
// interest flag, no e-Invoice fields on their catalog entries.
const PAYMENT_TRX_CLASSES = ['receipt', 'refund'];
const TRX_CLASS_KEYS = TRX_CLASSES.map((c) => c.key);

// Producer modules a Transaction Type can be opened to (usableInModules).
// The UI offers only modules the company is entitled to; the posting seam
// enforces membership of this list. Golf/Facility/POS activate as their
// charge-to-account flows wire in.
const AR_MODULE_KEYS = [
    { key: 'membership', label: 'Membership', moduleCode: 'MEMBERSHIP' },
    { key: 'golf', label: 'Golf', moduleCode: 'GOLF' },
    { key: 'facility', label: 'Facility', moduleCode: 'FACILITY' },
    { key: 'pos', label: 'POS', moduleCode: 'POS' },
];

// --- Document ledger (slice 2) ---

// Ledger documents (open-item side). mode is FIXED per kind except the
// invoice void-reversal (an invoice row with mode 'credit' + reversalOfId).
const LEDGER_DOC_KINDS = [
    { key: 'invoice', label: 'Invoice', mode: 'debit', numberingPurpose: 'ar-invoice' },
    { key: 'debit-note', label: 'Debit Note', mode: 'debit', numberingPurpose: 'ar-debit-note' },
    { key: 'credit-note', label: 'Credit Note', mode: 'credit', numberingPurpose: 'ar-credit-note' },
];

// SYSTEM-posted ledger kinds (own docType 2026-09-04): never manually keyed -
// the manual doors keep validating against LEDGER_DOC_KINDS only, while the
// posting ENGINE accepts both lists. Interest is posted solely by the
// interest run's confirm.
const SYSTEM_LEDGER_DOC_KINDS = [
    { key: 'interest', label: 'Interest', mode: 'debit', numberingPurpose: 'ar-interest' },
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
    TRX_CLASSES,
    TRX_CLASS_KEYS,
    PAYMENT_TRX_CLASSES,
    AR_MODULE_KEYS,
    DEBTOR_TYPES,
    DEBTOR_STATUSES,
    DEBTOR_TYPE_KEYS,
    DEBTOR_STATUS_KEYS,
    LEDGER_DOC_KINDS,
    SYSTEM_LEDGER_DOC_KINDS,
    LEDGER_DOC_KIND_KEYS,
    RECEIPT_DOC_KINDS,
    RECEIPT_DOC_KIND_KEYS,
    DEPOSIT_NUMBERING_PURPOSE,
    SOURCE_MODULES,
    ALLOCATION_PAIRS,
};
