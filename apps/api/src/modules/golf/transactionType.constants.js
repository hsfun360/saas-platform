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

// DEFAULT FOR GOLFER TYPE (user decisions 2026-09-26; extended to buggy and
// caddy 2026-10-06, Tropicana gap 6): an OPTIONAL marker on a transaction
// type naming the golfer category it is THE item for - at most ONE ACTIVE
// default per (charge type, category). NULL = a manual billing item for
// everyone (e.g. a Group Booking or Tournament green fee).
//   green-fee: the category's fee AUTO-CHARGES at registration. Members WITH
//              golfing right are never auto-charged; 'member' prices members
//              WITHOUT the right (member rate).
//   buggy-fee / caddy-fee: the category's item is the ONLY buggy/caddy tile
//              that category sees on the bill (member 75.60 vs visitor 91.80
//              resolve by the billed player, no clerk judgement); a tile with
//              no category stays visible to everyone.
// The front desk refuses a categorised tile on a player of another category.
const GOLFER_TYPES = [
    { key: 'member', label: 'Member' },
    { key: 'member-guest', label: 'Member as Guest' },
    { key: 'guest', label: 'Guest / Visitor' },
];

const GOLFER_TYPE_KEYS = GOLFER_TYPES.map((g) => g.key);

// Charge types that may carry the golfer-type default.
const GOLFER_TYPED_CHARGE_TYPE_KEYS = ['green-fee', 'buggy-fee', 'caddy-fee'];

module.exports = {
    CHARGE_TYPES, CHARGE_TYPE_KEYS, MATRIX_CHARGE_TYPE_KEYS, PACKAGE_CHARGE_TYPE_KEY,
    GOLFER_TYPES, GOLFER_TYPE_KEYS, GOLFER_TYPED_CHARGE_TYPE_KEYS,
};
