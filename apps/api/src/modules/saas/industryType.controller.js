const Company = require('./company.model');
const IndustryType = require('./industryType.model');

// Industry Type - subscriber-owned reference data. Maintenance is Tenant-Admin
// self-service under /auth/account/industry-types (the auth router applies
// authenticateToken + requireTenant + requireTenantAdmin); the active list for
// product pickers is served to any workspace user under /api/industry-types.

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
        industryTypeCode: row.industryTypeCode,
        description: row.description,
        isActive: row.isActive,
    };
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/industry-types - every industry type for the caller's account.
exports.listIndustryTypes = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await IndustryType.findAll({ where: { accountId }, order: [['industryTypeCode', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing industry types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/industry-types   Body: { industryTypeCode, description? }
exports.createIndustryType = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const industryTypeCode = String(req.body.industryTypeCode || '').trim();
        if (!industryTypeCode) return res.status(400).json({ message: 'Industry type code is required.' });
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        const existing = await IndustryType.findOne({ where: { accountId, industryTypeCode } });
        if (existing) return res.status(409).json({ message: `Industry type '${industryTypeCode}' already exists.` });

        const row = await IndustryType.create({ accountId, industryTypeCode, description });
        res.status(201).json({ message: 'Industry type created.', industryType: toDto(row) });
    } catch (error) {
        console.error('Error creating industry type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/industry-types/:id   Body: any of { industryTypeCode, description, isActive }
exports.updateIndustryType = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await IndustryType.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Industry type not found.' });

        if (typeof req.body.industryTypeCode === 'string' && req.body.industryTypeCode.trim()) {
            const industryTypeCode = req.body.industryTypeCode.trim();
            if (industryTypeCode !== row.industryTypeCode) {
                const clash = await IndustryType.findOne({ where: { accountId, industryTypeCode } });
                if (clash) return res.status(409).json({ message: `Industry type '${industryTypeCode}' already exists.` });
                row.industryTypeCode = industryTypeCode;
            }
        }
        if (typeof req.body.description === 'string') row.description = req.body.description.trim() || null;
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Industry type updated.', industryType: toDto(row) });
    } catch (error) {
        console.error('Error updating industry type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/industry-types - the active industry types of the caller's account,
// for dropdowns in Membership / Golf / future product screens.
exports.listActiveIndustryTypes = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(200).json([]);

        const rows = await IndustryType.findAll({
            where: { accountId, isActive: true },
            attributes: ['industryTypeCode', 'description'],
            order: [['industryTypeCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active industry types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
