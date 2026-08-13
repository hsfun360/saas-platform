// Bundled Malaysia LHDN e-Invoice tax types - a checked-in snapshot of
// https://sdk.myinvois.hasil.gov.my/files/TaxTypes.json (retrieved 2026-08-13).
// Used as the sync fallback when the LHDN site is unreachable from the server.
const DEFAULT_EINVOICE_TAX_TYPES = [
    { code: "01", description: "Sales Tax" },
    { code: "02", description: "Service Tax" },
    { code: "03", description: "Tourism Tax" },
    { code: "04", description: "High-Value Goods Tax" },
    { code: "05", description: "Sales Tax on Low Value Goods" },
    { code: "06", description: "Not Applicable" },
    { code: "E", description: "Tax exemption (where applicable)" },
];

module.exports = { DEFAULT_EINVOICE_TAX_TYPES };
