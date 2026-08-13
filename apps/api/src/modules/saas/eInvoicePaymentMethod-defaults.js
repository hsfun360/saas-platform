// Bundled Malaysia LHDN e-Invoice payment methods - a checked-in snapshot of
// https://sdk.myinvois.hasil.gov.my/files/PaymentMethods.json (retrieved 2026-08-13).
// Used as the sync fallback when the LHDN site is unreachable from the server.
const DEFAULT_EINVOICE_PAYMENT_METHODS = [
    { code: "01", description: "Cash" },
    { code: "02", description: "Cheque" },
    { code: "03", description: "Bank Transfer" },
    { code: "04", description: "Credit Card" },
    { code: "05", description: "Debit Card" },
    { code: "06", description: "e-Wallet / Digital Wallet" },
    { code: "07", description: "Digital Bank" },
    { code: "08", description: "Others" },
];

module.exports = { DEFAULT_EINVOICE_PAYMENT_METHODS };
