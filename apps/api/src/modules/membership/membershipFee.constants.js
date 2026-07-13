// Fixed vocabulary for a Membership Fee's installment interval. Stored as the
// stable `key`; the UI maps it to a label. Served to the screen via /fees/meta
// and validated on the server, same pattern as membershipStatus.constants.js.
const INSTALLMENT_INTERVALS = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'half-yearly', label: 'Half Yearly' },
    { key: 'annually', label: 'Annually' },
];

const INSTALLMENT_INTERVAL_KEYS = INSTALLMENT_INTERVALS.map((i) => i.key);

module.exports = { INSTALLMENT_INTERVALS, INSTALLMENT_INTERVAL_KEYS };
