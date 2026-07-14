const Company = require('./company.model');
const Race = require('./race.model');

// Race - subscriber-owned reference data. Maintenance is Tenant-Admin
// self-service under /auth/account/races (the auth router applies
// authenticateToken + requireTenant + requireTenantAdmin); the active list for
// product pickers is served to any workspace user under /api/races.

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
        raceCode: row.raceCode,
        description: row.description,
        isActive: row.isActive,
    };
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/races - every race for the caller's account.
exports.listRaces = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await Race.findAll({ where: { accountId }, order: [['raceCode', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing races:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/races   Body: { raceCode, description? }
exports.createRace = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const raceCode = String(req.body.raceCode || '').trim();
        if (!raceCode) return res.status(400).json({ message: 'Race code is required.' });
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        const existing = await Race.findOne({ where: { accountId, raceCode } });
        if (existing) return res.status(409).json({ message: `Race '${raceCode}' already exists.` });

        const row = await Race.create({ accountId, raceCode, description });
        res.status(201).json({ message: 'Race created.', race: toDto(row) });
    } catch (error) {
        console.error('Error creating race:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/races/:id   Body: any of { raceCode, description, isActive }
exports.updateRace = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await Race.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Race not found.' });

        if (typeof req.body.raceCode === 'string' && req.body.raceCode.trim()) {
            const raceCode = req.body.raceCode.trim();
            if (raceCode !== row.raceCode) {
                const clash = await Race.findOne({ where: { accountId, raceCode } });
                if (clash) return res.status(409).json({ message: `Race '${raceCode}' already exists.` });
                row.raceCode = raceCode;
            }
        }
        if (typeof req.body.description === 'string') row.description = req.body.description.trim() || null;
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Race updated.', race: toDto(row) });
    } catch (error) {
        console.error('Error updating race:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/races - the active races of the caller's account, for dropdowns in
// Membership / future product screens.
exports.listActiveRaces = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(200).json([]);

        const rows = await Race.findAll({
            where: { accountId, isActive: true },
            attributes: ['raceCode', 'description'],
            order: [['raceCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active races:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
