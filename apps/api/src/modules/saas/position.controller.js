const Company = require('./company.model');
const Position = require('./position.model');

// Position - subscriber-owned reference data with a seniority `rank` (higher =
// more senior; the Phase-3 data-scope rule compares ranks). Maintenance is
// Tenant-Admin self-service under /auth/account/positions; the active list for
// pickers is served to any workspace user under /api/positions. Same pattern
// as IndustryType, plus a "Load defaults" seed of the standard 3-level ladder.

// The bundled starter ladder, gapped by 10 so levels can be inserted between.
const DEFAULT_POSITIONS = [
    { positionCode: 'STF', description: 'Staff', rank: 10 },
    { positionCode: 'SUP', description: 'Supervisor', rank: 20 },
    { positionCode: 'MGR', description: 'Manager', rank: 30 },
];

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
        positionCode: row.positionCode,
        description: row.description,
        rank: row.rank,
        isActive: row.isActive,
    };
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/positions - every position for the caller's account,
// most senior first.
exports.listPositions = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await Position.findAll({ where: { accountId }, order: [['rank', 'DESC'], ['positionCode', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing positions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/positions   Body: { positionCode, description?, rank }
exports.createPosition = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const positionCode = String(req.body.positionCode || '').trim();
        if (!positionCode) return res.status(400).json({ message: 'Position code is required.' });
        const rank = Number(req.body.rank);
        if (!Number.isInteger(rank)) return res.status(400).json({ message: 'Rank must be a whole number (higher = more senior).' });
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        const existing = await Position.findOne({ where: { accountId, positionCode } });
        if (existing) return res.status(409).json({ message: `Position '${positionCode}' already exists.` });

        const row = await Position.create({ accountId, positionCode, description, rank });
        res.status(201).json({ message: 'Position created.', position: toDto(row) });
    } catch (error) {
        console.error('Error creating position:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/positions/:id   Body: any of { positionCode, description, rank, isActive }
exports.updatePosition = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await Position.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Position not found.' });

        if (typeof req.body.positionCode === 'string' && req.body.positionCode.trim()) {
            const positionCode = req.body.positionCode.trim();
            if (positionCode !== row.positionCode) {
                const clash = await Position.findOne({ where: { accountId, positionCode } });
                if (clash) return res.status(409).json({ message: `Position '${positionCode}' already exists.` });
                row.positionCode = positionCode;
            }
        }
        if (req.body.rank !== undefined) {
            const rank = Number(req.body.rank);
            if (!Number.isInteger(rank)) return res.status(400).json({ message: 'Rank must be a whole number (higher = more senior).' });
            row.rank = rank;
        }
        if (typeof req.body.description === 'string') row.description = req.body.description.trim() || null;
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Position updated.', position: toDto(row) });
    } catch (error) {
        console.error('Error updating position:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /auth/account/positions/defaults - the bundled starter ladder, flagged
// with which codes already exist, so the UI can preview + select before seeding
// (the "show expected results" standard).
exports.getDefaultPositions = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const existing = await Position.findAll({ where: { accountId }, attributes: ['positionCode'] });
        const existingCodes = new Set(existing.map(r => r.positionCode));
        res.status(200).json(DEFAULT_POSITIONS.map(p => ({ ...p, alreadyExists: existingCodes.has(p.positionCode) })));
    } catch (error) {
        console.error('Error listing default positions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/positions/seed   Body: { codes?: string[] } - create the
// selected bundled defaults (all missing ones when codes is omitted). Existing
// codes are never overwritten. Returns { created, skipped }.
exports.seedPositions = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const wanted = Array.isArray(req.body.codes) && req.body.codes.length
            ? DEFAULT_POSITIONS.filter(p => req.body.codes.includes(p.positionCode))
            : DEFAULT_POSITIONS;

        const existing = await Position.findAll({ where: { accountId }, attributes: ['positionCode'] });
        const existingCodes = new Set(existing.map(r => r.positionCode));

        let created = 0;
        let skipped = 0;
        for (const p of wanted) {
            if (existingCodes.has(p.positionCode)) { skipped++; continue; }
            await Position.create({ accountId, ...p });
            created++;
        }
        res.status(200).json({ message: `${created} position(s) created, ${skipped} skipped.`, created, skipped });
    } catch (error) {
        console.error('Error seeding positions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/positions - the active positions of the caller's account (most
// senior first), for assignment pickers and future product screens.
exports.listActivePositions = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(200).json([]);

        const rows = await Position.findAll({
            where: { accountId, isActive: true },
            attributes: ['id', 'positionCode', 'description', 'rank'],
            order: [['rank', 'DESC'], ['positionCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active positions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
