// Bundled platform tax-scheme STARTER catalog (SEA-first rollout).
//
// This is the source the platform seeds into TaxSchemeTemplate / TaxRateTemplate at
// boot (see taxTemplate.service.js), the same "ship curated defaults" pattern as the
// bundled currency defaults and the email platform templates. It is a best-effort,
// point-in-time snapshot (see each country's `seededAsOf`) - NOT an authoritative,
// continuously-maintained tax source. Subscribers "Load defaults for country" to copy
// these into their own catalog, then own and maintain them (rates change = new dated
// row on their side). To add a country or correct a starter rate, edit THIS file and
// redeploy; the boot seeder refreshes the templates (preserving admin enable/disable).
//
// Rates here are the standard headline rate as of `seededAsOf`; verify against current
// law before relying on them. GL accounts are intentionally absent - they are a
// per-company concern set at adoption time.
module.exports = [
    {
        // Malaysia - Sales & Service Tax (service tax raised to 8% on 2024-03-01).
        countryCode: 'my',
        seededAsOf: '2024-03-01',
        schemes: [
            {
                taxSchemeCode: 'SST-OUT', name: 'Sales & Service Tax (Output)',
                description: 'SST charged on taxable sales/services.',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'SST', taxRate: 8, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
            {
                taxSchemeCode: 'SST-IN', name: 'Service Tax (Input)',
                description: 'Service tax on purchases, recoverable where eligible.',
                ieFlag: 'EXCLUSIVE', taxClass: 'INPUT',
                rates: [{ taxCode: 'TX', taxRate: 8, taxPriority: 1, isClaimable: true, claimPercentage: 100 }],
            },
            {
                taxSchemeCode: 'ZR', name: 'Zero-Rated',
                description: 'Taxable at 0%.',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'ZR', taxRate: 0, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
            {
                taxSchemeCode: 'EX', name: 'Exempt',
                description: 'Exempt from tax.',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'EX', taxRate: 0, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
        ],
    },
    {
        // Singapore - GST (raised to 9% on 2024-01-01).
        countryCode: 'sg',
        seededAsOf: '2024-01-01',
        schemes: [
            {
                taxSchemeCode: 'GST-OUT', name: 'GST (Output, Standard-Rated)',
                description: 'GST charged on standard-rated supplies.',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'SR', taxRate: 9, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
            {
                taxSchemeCode: 'GST-IN', name: 'GST (Input Tax)',
                description: 'GST on purchases, recoverable where eligible.',
                ieFlag: 'EXCLUSIVE', taxClass: 'INPUT',
                rates: [{ taxCode: 'TX', taxRate: 9, taxPriority: 1, isClaimable: true, claimPercentage: 100 }],
            },
            {
                taxSchemeCode: 'ZR', name: 'Zero-Rated',
                description: 'GST at 0% (exports / international services).',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'ZR', taxRate: 0, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
            {
                taxSchemeCode: 'ES', name: 'Exempt Supply',
                description: 'Exempt from GST.',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'ES', taxRate: 0, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
        ],
    },
    {
        // Thailand - VAT 7%.
        countryCode: 'th',
        seededAsOf: '2024-01-01',
        schemes: [
            {
                taxSchemeCode: 'VAT-OUT', name: 'VAT (Output)',
                description: 'Output VAT on sales.',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'VAT', taxRate: 7, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
            {
                taxSchemeCode: 'VAT-IN', name: 'VAT (Input)',
                description: 'Input VAT on purchases, recoverable where eligible.',
                ieFlag: 'EXCLUSIVE', taxClass: 'INPUT',
                rates: [{ taxCode: 'VAT', taxRate: 7, taxPriority: 1, isClaimable: true, claimPercentage: 100 }],
            },
        ],
    },
    {
        // Indonesia - PPN (VAT) 11%.
        countryCode: 'id',
        seededAsOf: '2022-04-01',
        schemes: [
            {
                taxSchemeCode: 'PPN-OUT', name: 'PPN (Output)',
                description: 'Output VAT (PPN Keluaran) on sales.',
                ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT',
                rates: [{ taxCode: 'PPN', taxRate: 11, taxPriority: 1, isClaimable: false, claimPercentage: 0 }],
            },
            {
                taxSchemeCode: 'PPN-IN', name: 'PPN (Input)',
                description: 'Input VAT (PPN Masukan), recoverable where eligible.',
                ieFlag: 'EXCLUSIVE', taxClass: 'INPUT',
                rates: [{ taxCode: 'PPN', taxRate: 11, taxPriority: 1, isClaimable: true, claimPercentage: 100 }],
            },
        ],
    },
];
