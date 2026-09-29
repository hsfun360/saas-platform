// Golf front-desk vocabularies (user decisions 2026-09-26; Player lifecycle
// per the 2026-09-29 revamp - one golf.Player table carries a record from
// booked through registration).

const PLAYER_STATUSES = [
    { key: 'booked', label: 'Booked' },
    { key: 'registered', label: 'Registered' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'no-show', label: 'No show' },
];

const BILL_STATUSES = [
    { key: 'open', label: 'Open' },
    { key: 'settled', label: 'Settled' },
    { key: 'voided', label: 'Voided' },
];

const PLAYER_STATUS_KEYS = PLAYER_STATUSES.map((s) => s.key);
const BILL_STATUS_KEYS = BILL_STATUSES.map((s) => s.key);

// Statuses that OCCUPY a seat (capacity counts these).
const ACTIVE_PLAYER_STATUS_KEYS = ['booked', 'registered'];

// BillItem package explosion roles: an element line of a package group, or
// the automatic balance line to the package's autoTransactionTypeId.
const PACKAGE_ROLES = ['element', 'auto'];

module.exports = {
    PLAYER_STATUSES,
    PLAYER_STATUS_KEYS,
    ACTIVE_PLAYER_STATUS_KEYS,
    BILL_STATUSES,
    BILL_STATUS_KEYS,
    PACKAGE_ROLES,
};
