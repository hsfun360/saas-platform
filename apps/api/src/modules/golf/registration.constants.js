// Golf front-desk vocabularies (user decisions 2026-09-26).

const REGISTRATION_STATUSES = [
    { key: 'registered', label: 'Registered' },
    { key: 'cancelled', label: 'Cancelled' },
];

const BILL_STATUSES = [
    { key: 'open', label: 'Open' },
    { key: 'settled', label: 'Settled' },
    { key: 'voided', label: 'Voided' },
];

const REGISTRATION_STATUS_KEYS = REGISTRATION_STATUSES.map((s) => s.key);
const BILL_STATUS_KEYS = BILL_STATUSES.map((s) => s.key);

// BillItem package explosion roles: an element line of a package group, or
// the automatic balance line to the package's autoTransactionTypeId.
const PACKAGE_ROLES = ['element', 'auto'];

module.exports = {
    REGISTRATION_STATUSES,
    REGISTRATION_STATUS_KEYS,
    BILL_STATUSES,
    BILL_STATUS_KEYS,
    PACKAGE_ROLES,
};
