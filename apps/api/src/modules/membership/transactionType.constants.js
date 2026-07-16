// Fixed vocabulary for a Transaction Type's charge type - WHAT KIND of billing
// item the code represents. Consumers filter their pickers by it:
//   Joining fees dialog        -> membership-fee + absentee-fee
//   Standing charges dialog    -> standing-charges
//   Membership transfer (Ph.3) -> membership-transfer
// Served to the screen via /transaction-types/meta and validated on the server.
const CHARGE_TYPES = [
    { key: 'membership-fee', label: 'Membership Fee' },
    { key: 'standing-charges', label: 'Standing Charges' },
    { key: 'membership-transfer', label: 'Membership Transfer' },
    { key: 'absentee-fee', label: 'Absentee Fee' },
    { key: 'miscellaneous', label: 'Miscellaneous' },
];

const CHARGE_TYPE_KEYS = CHARGE_TYPES.map((c) => c.key);

module.exports = { CHARGE_TYPES, CHARGE_TYPE_KEYS };
