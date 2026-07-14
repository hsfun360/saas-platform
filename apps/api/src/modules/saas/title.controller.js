const { Op } = require('sequelize');
const Company = require('./company.model');
const Country = require('./country.model');
const Title = require('./title.model');

// Title (honorific) - subscriber-owned reference data. Maintenance is Tenant-Admin
// self-service under /auth/account/titles (the auth router applies
// authenticateToken + requireTenant + requireTenantAdmin); the active list for
// product pickers is served to any workspace user under /api/titles.

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
        titleCode: row.titleCode,
        description: row.description,
        countryCode: row.countryCode,
        isActive: row.isActive,
    };
}

// Validate the optional country reference. Returns { value } (null = universal)
// or { error }. Accepts a Country.alpha2 (case-insensitive).
async function parseCountryCode(v) {
    if (v === undefined || v === null || String(v).trim() === '') return { value: null };
    const countryCode = String(v).trim().toLowerCase();
    const country = await Country.findOne({ where: { alpha2: countryCode }, attributes: ['alpha2'] });
    if (!country) return { error: 'Country not found.' };
    return { value: countryCode };
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/titles - every title for the caller's account.
exports.listTitles = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await Title.findAll({ where: { accountId }, order: [['titleCode', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing titles:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/titles   Body: { titleCode, description?, countryCode? }
exports.createTitle = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const titleCode = String(req.body.titleCode || '').trim();
        if (!titleCode) return res.status(400).json({ message: 'Title code is required.' });
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        const parsedCountry = await parseCountryCode(req.body.countryCode);
        if (parsedCountry.error) return res.status(400).json({ message: parsedCountry.error });

        const existing = await Title.findOne({ where: { accountId, titleCode } });
        if (existing) return res.status(409).json({ message: `Title '${titleCode}' already exists.` });

        const row = await Title.create({ accountId, titleCode, description, countryCode: parsedCountry.value });
        res.status(201).json({ message: 'Title created.', title: toDto(row) });
    } catch (error) {
        console.error('Error creating title:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/titles/:id   Body: any of { titleCode, description, countryCode, isActive }
exports.updateTitle = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await Title.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Title not found.' });

        if (typeof req.body.titleCode === 'string' && req.body.titleCode.trim()) {
            const titleCode = req.body.titleCode.trim();
            if (titleCode !== row.titleCode) {
                const clash = await Title.findOne({ where: { accountId, titleCode } });
                if (clash) return res.status(409).json({ message: `Title '${titleCode}' already exists.` });
                row.titleCode = titleCode;
            }
        }
        if (typeof req.body.description === 'string') row.description = req.body.description.trim() || null;
        if (req.body.countryCode !== undefined) {
            const parsedCountry = await parseCountryCode(req.body.countryCode);
            if (parsedCountry.error) return res.status(400).json({ message: parsedCountry.error });
            row.countryCode = parsedCountry.value;
        }
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Title updated.', title: toDto(row) });
    } catch (error) {
        console.error('Error updating title:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/titles[?countryCode=xx] - the active titles of the caller's account.
// With countryCode: returns universal titles (countryCode NULL) + that country's.
// Without it: all active titles (each carrying its countryCode for display).
exports.listActiveTitles = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(200).json([]);

        const where = { accountId, isActive: true };
        const cc = typeof req.query.countryCode === 'string' ? req.query.countryCode.trim().toLowerCase() : '';
        if (cc) where[Op.or] = [{ countryCode: null }, { countryCode: cc }];

        const rows = await Title.findAll({
            where,
            attributes: ['titleCode', 'description', 'countryCode'],
            order: [['titleCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active titles:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
