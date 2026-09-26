// Fixed vocabulary for a golf Transaction Type's charge type - WHAT KIND of
// billing item the code represents. Consumers filter their pickers by it
// (green-fee matrices, no-show/cancellation penalties, buggy/caddy charges).
// Served to the screen via /golf/transaction-types/meta and validated on the
// server.
const CHARGE_TYPES = [
    { key: 'green-fee', label: 'Green Fee' },
    { key: 'caddy-fee', label: 'Caddy Fee' },
    { key: 'buggy-fee', label: 'Buggy Fee' },
    { key: 'no-show', label: 'No Show Charges' },
    { key: 'miscellaneous', label: 'Miscellaneous' },
    { key: 'package', label: 'Package' },
];

const CHARGE_TYPE_KEYS = CHARGE_TYPES.map((c) => c.key);

// Charge types priced by the 4-cell matrix (9/18 holes × weekday/weekend;
// simplified from the earlier 8-cell member/visitor matrix on 2026-09-26 -
// the GOLFER CATEGORY now lives on the transaction type itself, one billing
// item per category). The rest (no-show, miscellaneous, package) take a
// single flat amount per effective date instead.
const MATRIX_CHARGE_TYPE_KEYS = ['green-fee', 'caddy-fee', 'buggy-fee'];

// A package bundles OTHER transaction types (its elements, with quantity and a
// per-unit amount). At billing a package EXPLODES into its element lines plus
// an automatic balance line to the package's autoTransactionTypeId; the
// PACKAGE's own tax scheme applies to every generated line, with the last
// line's tax adjusted so the group's tax equals the tax on the package amount
// (user decisions 2026-08-27, superseding the earlier per-element-scheme idea).
const PACKAGE_CHARGE_TYPE_KEY = 'package';

// WHO a green-fee transaction type charges (user decision 2026-09-26): the
// golfer category lives ON the type - one active green-fee type per category,
// so registration auto-billing resolves the item without extra configuration.
// Members WITH golfing right are never charged a green fee at all; the
// 'member' category prices members WITHOUT the right (member rate).
const GOLFER_TYPES = [
    { key: 'member', label: 'Member (no golfing right)' },
    { key: 'member-guest', label: 'Member as Guest' },
    { key: 'guest', label: 'Guest / Visitor' },
];

const GOLFER_TYPE_KEYS = GOLFER_TYPES.map((g) => g.key);

module.exports = {
    CHARGE_TYPES, CHARGE_TYPE_KEYS, MATRIX_CHARGE_TYPE_KEYS, PACKAGE_CHARGE_TYPE_KEY,
    GOLFER_TYPES, GOLFER_TYPE_KEYS,
};
