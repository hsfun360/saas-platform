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
];

const CHARGE_TYPE_KEYS = CHARGE_TYPES.map((c) => c.key);

module.exports = { CHARGE_TYPES, CHARGE_TYPE_KEYS };
