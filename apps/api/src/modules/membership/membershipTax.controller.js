const { listCompanyTaxSchemes, resolveCompanyTaxScheme, quoteTax } = require('../../platform/taxGateway');

// Membership Management is the FIRST consumer of the Tax service. It does not own
// tax data and never touches the tax module directly - it reads through the tax
// gateway seam, which resolves the active company's country + account and returns
// snapshot-ready schemes/components. When Membership builds a charge/invoice, it
// SNAPSHOTS the resolved component (code + rate + claimability) onto its own row so
// posted documents keep the rate they were charged.

// GET /api/membership/tax/schemes[?date=YYYY-MM-DD]
// The tax schemes available to the active company (by its country), each with its
// components effective on `date` (defaults to today). Populates a tax picker on a
// membership billing screen.
exports.listSchemes = async (req, res) => {
    try {
        const onDate = typeof req.query.date === 'string' && req.query.date ? req.query.date : undefined;
        const { scope, schemes } = await listCompanyTaxSchemes(req, onDate);
        if (!scope) {
            return res.status(400).json({
                message: 'This company has no country set. Set the company country (System Setup → Companies) to use tax.',
            });
        }
        res.status(200).json(schemes);
    } catch (error) {
        console.error('Error listing company tax schemes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/tax/schemes/:code[?date=YYYY-MM-DD]
// Resolve ONE scheme's active components for the active company - the raw components,
// before any amount is applied.
exports.resolveScheme = async (req, res) => {
    try {
        const onDate = typeof req.query.date === 'string' && req.query.date ? req.query.date : undefined;
        const resolved = await resolveCompanyTaxScheme(req, req.params.code, onDate);
        if (!resolved) {
            return res.status(404).json({ message: 'No active tax scheme found for this company and code.' });
        }
        res.status(200).json(resolved);
    } catch (error) {
        console.error('Error resolving company tax scheme:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/tax/quote   Body: { taxSchemeCode, amount, date? }
// Compute the tax breakdown on an amount using the shared calculator. This is what a
// billing screen calls to preview tax before/after saving a charge; the charge then
// snapshots the returned lines. `amount` is the net base (EXCLUSIVE scheme) or the
// tax-inclusive gross (INCLUSIVE scheme).
exports.quote = async (req, res) => {
    try {
        const taxSchemeCode = typeof req.body.taxSchemeCode === 'string' ? req.body.taxSchemeCode.trim() : '';
        const amount = Number(req.body.amount);
        const onDate = typeof req.body.date === 'string' && req.body.date ? req.body.date : undefined;
        if (!taxSchemeCode) return res.status(400).json({ message: 'taxSchemeCode is required.' });
        if (!Number.isFinite(amount)) return res.status(400).json({ message: 'A numeric amount is required.' });

        const result = await quoteTax(req, { taxSchemeCode, amount, onDate });
        if (!result) {
            return res.status(404).json({ message: 'No active tax scheme found for this company and code.' });
        }
        res.status(200).json(result);
    } catch (error) {
        console.error('Error quoting tax:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
