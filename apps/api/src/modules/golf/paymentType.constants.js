// Fixed vocabulary for a golf Payment Type's payment class - HOW the money
// arrives when a bill is settled at the golf front desk (user decision
// 2026-09-14). Consumers (the future billing/settlement screen) branch on it:
// 'debtor' charges to an AR account, 'member' to the member's account,
// 'suspend' parks the amount, the rest are tender kinds. Served to the screen
// via /golf/payment-types/meta and validated on the server.
const PAYMENT_CLASSES = [
    { key: 'debtor', label: 'Debtor' },
    { key: 'cash', label: 'Cash' },
    { key: 'member', label: 'Member' },
    { key: 'voucher', label: 'Voucher' },
    { key: 'staff', label: 'Staff' },
    { key: 'online', label: 'Online' },
    { key: 'suspend', label: 'Suspend' },
    { key: 'creditcard', label: 'Credit Card' },
];

const PAYMENT_CLASS_KEYS = PAYMENT_CLASSES.map((c) => c.key);

module.exports = { PAYMENT_CLASSES, PAYMENT_CLASS_KEYS };
