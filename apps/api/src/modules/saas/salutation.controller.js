const Company = require('./company.model');
const Salutation = require('./salutation.model');

// Salutation - subscriber-owned reference data. Maintenance is Tenant-Admin
// self-service under /auth/account/salutations (the auth router applies
// authenticateToken + requireTenant + requireTenantAdmin); the active list for
// product pickers is served to any workspace user under /api/salutations.

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
        salutationCode: row.salutationCode,
        description: row.description,
        isActive: row.isActive,
    };
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/salutations - every salutation for the caller's account.
exports.listSalutations = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await Salutation.findAll({ where: { accountId }, order: [['salutationCode', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing salutations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/salutations   Body: { salutationCode, description? }
exports.createSalutation = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const salutationCode = String(req.body.salutationCode || '').trim();
        if (!salutationCode) return res.status(400).json({ message: 'Salutation code is required.' });
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        const existing = await Salutation.findOne({ where: { accountId, salutationCode } });
        if (existing) return res.status(409).json({ message: `Salutation '${salutationCode}' already exists.` });

        const row = await Salutation.create({ accountId, salutationCode, description });
        res.status(201).json({ message: 'Salutation created.', salutation: toDto(row) });
    } catch (error) {
        console.error('Error creating salutation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/salutations/:id   Body: any of { salutationCode, description, isActive }
exports.updateSalutation = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await Salutation.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Salutation not found.' });

        if (typeof req.body.salutationCode === 'string' && req.body.salutationCode.trim()) {
            const salutationCode = req.body.salutationCode.trim();
            if (salutationCode !== row.salutationCode) {
                const clash = await Salutation.findOne({ where: { accountId, salutationCode } });
                if (clash) return res.status(409).json({ message: `Salutation '${salutationCode}' already exists.` });
                row.salutationCode = salutationCode;
            }
        }
        if (typeof req.body.description === 'string') row.description = req.body.description.trim() || null;
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Salutation updated.', salutation: toDto(row) });
    } catch (error) {
        console.error('Error updating salutation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/salutations - the active salutations of the caller's account, for
// dropdowns in Membership / Golf / future product screens.
exports.listActiveSalutations = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(200).json([]);

        const rows = await Salutation.findAll({
            where: { accountId, isActive: true },
            attributes: ['salutationCode', 'description'],
            order: [['salutationCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active salutations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
