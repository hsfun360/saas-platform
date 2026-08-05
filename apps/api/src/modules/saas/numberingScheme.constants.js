// Fixed vocabularies for Numbering Control (document/reference numbering).
// Stored as stable keys; the UI maps to labels and the API validates against them.

// How a number is produced when a record is saved.
const NUMBERING_MODES = [
    { key: 'auto', label: 'Auto-generate' },   // system generates from the format + counter
    { key: 'manual', label: 'Manual entry' },  // user keys it in (e.g. pre-printed cards)
];

// When the running sequence resets back to the starting number.
const RESET_RULES = [
    { key: 'never', label: 'Never (continuous)' },
    { key: 'annually', label: 'Annually' },
    { key: 'monthly', label: 'Monthly' },
];

// What a scheme numbers. One scheme per (company, purpose). SPLIT PER OWNING
// MODULE (2026-08-05): each product owns its numbering table (gapless issue
// locks the counter inside the posting transaction, so the counter must live
// in the same schema as the documents it numbers - a service-split
// prerequisite). The gateway routes a purpose to its owner's table.
const MEMBERSHIP_NUMBERING_PURPOSES = [
    { key: 'membership', label: 'Membership No.' },
];
const AR_NUMBERING_PURPOSES = [
    { key: 'ar-invoice', label: 'Invoice No.' },
    { key: 'ar-debit-note', label: 'Debit Note No.' },
    { key: 'ar-credit-note', label: 'Credit Note No.' },
    { key: 'ar-receipt', label: 'Official Receipt No.' },
    { key: 'ar-refund', label: 'Refund No.' },
    { key: 'ar-deposit', label: 'Deposit No.' },
    { key: 'ar-statement', label: 'Statement No.' },
    { key: 'ar-other-debtor', label: 'Other Debtor Code' },
];
// Combined view (gateway validation, legacy meta).
const NUMBERING_PURPOSES = [...MEMBERSHIP_NUMBERING_PURPOSES, ...AR_NUMBERING_PURPOSES];

// Placeholders allowed in a scheme's `format`. Documented for the screen's help.
//   {PREFIX} - the scheme's prefix string
//   {SEQ}    - the running sequence, zero-padded to seqPadLength
//   {YYYY}   - 4-digit year        {YY} - 2-digit year        {MM} - 2-digit month
//   {TYPE}   - the membership type's category code (filled at creation time)
const FORMAT_TOKENS = [
    { token: '{PREFIX}', label: 'Prefix' },
    { token: '{SEQ}', label: 'Sequence (padded)' },
    { token: '{YYYY}', label: '4-digit year' },
    { token: '{YY}', label: '2-digit year' },
    { token: '{MM}', label: '2-digit month' },
    { token: '{TYPE}', label: 'Membership type code' },
];

const NUMBERING_MODE_KEYS = NUMBERING_MODES.map((m) => m.key);
const RESET_RULE_KEYS = RESET_RULES.map((r) => r.key);
const NUMBERING_PURPOSE_KEYS = NUMBERING_PURPOSES.map((p) => p.key);

module.exports = {
    NUMBERING_MODES,
    RESET_RULES,
    NUMBERING_PURPOSES,
    MEMBERSHIP_NUMBERING_PURPOSES,
    AR_NUMBERING_PURPOSES,
    FORMAT_TOKENS,
    NUMBERING_MODE_KEYS,
    RESET_RULE_KEYS,
    NUMBERING_PURPOSE_KEYS,
};
