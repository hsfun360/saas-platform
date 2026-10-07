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
    // Group booking (2026-10-07): apply a HELD DEPOSIT (a settled deposit
    // bill of the folio) to the final group bill - no money moves.
    { key: 'deposit', label: 'Deposit' },
];

const PAYMENT_CLASS_KEYS = PAYMENT_CLASSES.map((c) => c.key);

// Tenders that charge an AR ledger account: 'member' = the billed member's
// own account, 'debtor' = the folio's billing party (city ledger).
const ACCOUNT_PAYMENT_CLASSES = ['member', 'debtor'];

module.exports = { PAYMENT_CLASSES, PAYMENT_CLASS_KEYS, ACCOUNT_PAYMENT_CLASSES };
