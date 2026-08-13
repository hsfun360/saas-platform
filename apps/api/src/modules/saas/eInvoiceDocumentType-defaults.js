// Bundled Malaysia LHDN e-Invoice document types - a checked-in snapshot of
// https://sdk.myinvois.hasil.gov.my/files/EInvoiceTypes.json (retrieved 2026-08-13).
// Used as the sync fallback when the LHDN site is unreachable from the server.
const DEFAULT_EINVOICE_DOCUMENT_TYPES = [
    { code: "01", description: "Invoice" },
    { code: "02", description: "Credit Note" },
    { code: "03", description: "Debit Note" },
    { code: "04", description: "Refund Note" },
    { code: "11", description: "Self-billed Invoice" },
    { code: "12", description: "Self-billed Credit Note" },
    { code: "13", description: "Self-billed Debit Note" },
    { code: "14", description: "Self-billed Refund Note" },
];

module.exports = { DEFAULT_EINVOICE_DOCUMENT_TYPES };
