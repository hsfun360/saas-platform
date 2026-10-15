// Rain check vocabularies (user decisions 2026-10-15).

const RAIN_CHECK_STATUSES = [
    { key: 'issued', label: 'Issued' },
    { key: 'redeemed', label: 'Redeemed' },
    { key: 'expired', label: 'Expired' },
    { key: 'cancelled', label: 'Cancelled' },
];
const RAIN_CHECK_STATUS_KEYS = RAIN_CHECK_STATUSES.map((s) => s.key);

// What the credit value is computed from: the bill's green-fee lines only
// (caddy and buggy are consumed) or the whole bill.
const RAIN_CHECK_BASES = [
    { key: 'green-fee', label: 'Green-fee lines only' },
    { key: 'bill', label: 'The whole bill' },
];
const RAIN_CHECK_BASIS_KEYS = RAIN_CHECK_BASES.map((b) => b.key);

module.exports = {
    RAIN_CHECK_STATUSES,
    RAIN_CHECK_STATUS_KEYS,
    RAIN_CHECK_BASES,
    RAIN_CHECK_BASIS_KEYS,
};
