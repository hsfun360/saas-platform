const { sequelize } = require('../../platform/db');
const { companyTaxScope } = require('../../platform/taxGateway');
const TaxScheme = require('./taxScheme.model');
const CompanyTaxScheme = require('./companyTaxScheme.model');
const CompanyTaxAccount = require('./companyTaxAccount.model');
const { resolveScheme } = require('./taxResolver');

// Per-company adoption of subscriber tax schemes, for the ACTIVE company (workspace).
// A Tenant Admin, in a company's context, disables schemes that company does not use
// and overrides GL accounts per component. Opt-out model: no row = enabled with the
// subscriber defaults. Scope (companyId + accountId + countryCode) comes from the
// gateway seam so this never queries Company directly.

// GET /api/tax/company/schemes
// Every scheme available to the active company (its country's active schemes), with
// the company's adoption state and each component's default vs company GL account.
exports.getAdoption = async (req, res) => {
    try {
        const scope = await companyTaxScope(req);
        if (!scope) {
            return res.status(400).json({ message: 'This company has no country set. Set the company country first.' });
        }
        const { companyId, accountId, countryCode } = scope;

        const schemes = await TaxScheme.findAll({
            where: { accountId, countryCode, isActive: true },
            order: [['taxSchemeCode', 'ASC']],
        });

        // The company's override rows, indexed by scheme id.
        const adoptions = await CompanyTaxScheme.findAll({
            where: { companyId },
            include: [{ model: CompanyTaxAccount, as: 'GlOverrides' }],
        });
        const byScheme = new Map(adoptions.map((a) => [a.taxSchemeId, a]));

        const out = [];
        for (const s of schemes) {
            const resolved = await resolveScheme({ accountId, countryCode, taxSchemeCode: s.taxSchemeCode });
            const adoption = byScheme.get(s.id);
            const glMap = new Map((adoption?.GlOverrides || []).map((o) => [o.taxCode, o.glAccountCode]));

            out.push({
                id: s.id,
                taxSchemeCode: s.taxSchemeCode,
                name: s.name,
                ieFlag: s.ieFlag,
                taxClass: s.taxClass,
                // Absence of a row = enabled.
                isEnabled: adoption ? adoption.isEnabled : true,
                components: (resolved?.components || []).map((c) => ({
                    taxCode: c.taxCode,
                    taxRate: c.taxRate,
                    defaultGlAccountCode: c.glAccountCode || null,
                    companyGlAccountCode: glMap.get(c.taxCode) || null,
                })),
            });
        }

        res.status(200).json(out);
    } catch (error) {
        console.error('Error getting company tax adoption:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/tax/company/schemes/:taxSchemeId
// Body: { isEnabled?: boolean, glOverrides?: { [taxCode]: string|null } }
// Upserts the company's adoption row and replaces its GL overrides. An empty/omitted
// GL value clears that component's override (falls back to the subscriber default).
exports.setAdoption = async (req, res) => {
    try {
        const scope = await companyTaxScope(req);
        if (!scope) {
            return res.status(400).json({ message: 'This company has no country set. Set the company country first.' });
        }
        const { companyId, accountId, countryCode } = scope;

        // The scheme must belong to this subscriber AND this company's country.
        const scheme = await TaxScheme.findOne({ where: { id: req.params.taxSchemeId, accountId, countryCode } });
        if (!scheme) return res.status(404).json({ message: 'Tax scheme not found for this company.' });

        const isEnabled = req.body.isEnabled === undefined ? true : !!req.body.isEnabled;
        const rawOverrides = req.body.glOverrides && typeof req.body.glOverrides === 'object' ? req.body.glOverrides : {};
        const glRows = Object.entries(rawOverrides)
            .map(([taxCode, gl]) => ({ taxCode: String(taxCode).trim(), glAccountCode: typeof gl === 'string' ? gl.trim() : '' }))
            .filter((r) => r.taxCode && r.glAccountCode);

        await sequelize.transaction(async (t) => {
            const [adoption] = await CompanyTaxScheme.findOrCreate({
                where: { companyId, taxSchemeId: scheme.id },
                defaults: { companyId, taxSchemeId: scheme.id, isEnabled },
                transaction: t,
            });
            if (adoption.isEnabled !== isEnabled) {
                adoption.isEnabled = isEnabled;
                await adoption.save({ transaction: t });
            }
            // Replace the GL overrides wholesale (simplest correct semantics).
            await CompanyTaxAccount.destroy({ where: { companyTaxSchemeId: adoption.id }, transaction: t });
            if (glRows.length) {
                await CompanyTaxAccount.bulkCreate(
                    glRows.map((r) => ({ companyTaxSchemeId: adoption.id, taxCode: r.taxCode, glAccountCode: r.glAccountCode })),
                    { transaction: t },
                );
            }
        });

        res.status(200).json({ message: `${scheme.taxSchemeCode} ${isEnabled ? 'enabled' : 'disabled'} for this company.` });
    } catch (error) {
        console.error('Error setting company tax adoption:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
