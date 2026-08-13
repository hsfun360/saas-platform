// Bundled Malaysia LHDN e-Invoice state codes - a checked-in snapshot of
// https://sdk.myinvois.hasil.gov.my/files/StateCodes.json (retrieved 2026-08-13).
// Used as the sync fallback when the LHDN site is unreachable from the server.
const DEFAULT_EINVOICE_STATE_CODES = [
    { code: "01", description: "Johor" },
    { code: "02", description: "Kedah" },
    { code: "03", description: "Kelantan" },
    { code: "04", description: "Melaka" },
    { code: "05", description: "Negeri Sembilan" },
    { code: "06", description: "Pahang" },
    { code: "07", description: "Pulau Pinang" },
    { code: "08", description: "Perak" },
    { code: "09", description: "Perlis" },
    { code: "10", description: "Selangor" },
    { code: "11", description: "Terengganu" },
    { code: "12", description: "Sabah" },
    { code: "13", description: "Sarawak" },
    { code: "14", description: "Wilayah Persekutuan Kuala Lumpur" },
    { code: "15", description: "Wilayah Persekutuan Labuan" },
    { code: "16", description: "Wilayah Persekutuan Putrajaya" },
    { code: "17", description: "Not Applicable" },
];

module.exports = { DEFAULT_EINVOICE_STATE_CODES };
