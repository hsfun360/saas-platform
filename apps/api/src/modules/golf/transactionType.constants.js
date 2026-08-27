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

// Charge types priced by the full 8-cell matrix (member/visitor × 9/18 holes ×
// weekday/weekend). The rest (no-show, miscellaneous, package) take a single
// flat amount per effective date instead (user decisions 2026-08-06 / -27).
const MATRIX_CHARGE_TYPE_KEYS = ['green-fee', 'caddy-fee', 'buggy-fee'];

// A package bundles OTHER transaction types (its elements, with quantity and a
// per-unit allocation amount); elements cannot themselves be packages, and at
// billing each element portion is taxed by the ELEMENT's own scheme - a
// package carries no tax scheme of its own (user decisions 2026-08-27).
const PACKAGE_CHARGE_TYPE_KEY = 'package';

module.exports = { CHARGE_TYPES, CHARGE_TYPE_KEYS, MATRIX_CHARGE_TYPE_KEYS, PACKAGE_CHARGE_TYPE_KEY };
