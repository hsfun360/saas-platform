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

// What this scheme numbers. One scheme per (company, purpose). Only Membership No.
// is consumed today; the table is general so prospect / application / etc. can be
// added later without a rebuild.
const NUMBERING_PURPOSES = [
    { key: 'membership', label: 'Membership No.' },
];

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
    FORMAT_TOKENS,
    NUMBERING_MODE_KEYS,
    RESET_RULE_KEYS,
    NUMBERING_PURPOSE_KEYS,
};
