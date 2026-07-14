const Company = require('./company.model');
const Nationality = require('./nationality.model');

// Nationality - subscriber-owned reference data. Maintenance is Tenant-Admin
// self-service under /auth/account/nationalities (the auth router applies
// authenticateToken + requireTenant + requireTenantAdmin); the active list for
// product pickers is served to any workspace user under /api/nationalities.

// Resolve the caller's accountId from their active company (companyId = null
// means the System Administration workspace, which has no subscriber account).
async function resolveAccountId(companyId) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['accountId'] });
    return company ? company.accountId : null;
}

function toDto(row) {
    return {
        id: row.id,
        nationalityCode: row.nationalityCode,
        description: row.description,
        isActive: row.isActive,
    };
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/nationalities - every nationality for the caller's account.
exports.listNationalities = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await Nationality.findAll({ where: { accountId }, order: [['nationalityCode', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing nationalities:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/nationalities   Body: { nationalityCode, description? }
exports.createNationality = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const nationalityCode = String(req.body.nationalityCode || '').trim();
        if (!nationalityCode) return res.status(400).json({ message: 'Nationality code is required.' });
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        const existing = await Nationality.findOne({ where: { accountId, nationalityCode } });
        if (existing) return res.status(409).json({ message: `Nationality '${nationalityCode}' already exists.` });

        const row = await Nationality.create({ accountId, nationalityCode, description });
        res.status(201).json({ message: 'Nationality created.', nationality: toDto(row) });
    } catch (error) {
        console.error('Error creating nationality:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/nationalities/:id   Body: any of { nationalityCode, description, isActive }
exports.updateNationality = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await Nationality.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Nationality not found.' });

        if (typeof req.body.nationalityCode === 'string' && req.body.nationalityCode.trim()) {
            const nationalityCode = req.body.nationalityCode.trim();
            if (nationalityCode !== row.nationalityCode) {
                const clash = await Nationality.findOne({ where: { accountId, nationalityCode } });
                if (clash) return res.status(409).json({ message: `Nationality '${nationalityCode}' already exists.` });
                row.nationalityCode = nationalityCode;
            }
        }
        if (typeof req.body.description === 'string') row.description = req.body.description.trim() || null;
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Nationality updated.', nationality: toDto(row) });
    } catch (error) {
        console.error('Error updating nationality:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/nationalities - the active nationalities of the caller's account, for
// dropdowns in Membership / Golf / future product screens.
exports.listActiveNationalities = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(200).json([]);

        const rows = await Nationality.findAll({
            where: { accountId, isActive: true },
            attributes: ['nationalityCode', 'description'],
            order: [['nationalityCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active nationalities:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
