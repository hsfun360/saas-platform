const { Op } = require('sequelize');
const Company = require('./company.model');
const Country = require('./country.model');
const PublicHoliday = require('./publicHoliday.model');

// PublicHoliday - subscriber-owned reference data, scoped by country. Maintenance
// is Tenant-Admin self-service under /auth/account/public-holidays (the auth
// router applies authenticateToken + requireTenant + requireTenantAdmin); the
// active list for product calendars is served to any workspace user under
// /api/public-holidays, resolved to the caller's company country.

// Resolve the caller's accountId from their active company (companyId = null
// means the System Administration workspace, which has no subscriber account).
async function resolveAccountId(companyId) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, { attributes: ['accountId'] });
    return company ? company.accountId : null;
}

// The distinct countries the account's active companies operate in (from
// Company.countryCode; companies without a country set are skipped).
async function resolveCompanyCountryCodes(accountId) {
    const companies = await Company.findAll({
        where: { accountId, isActive: true, countryCode: { [Op.ne]: null } },
        attributes: ['countryCode'],
    });
    return [...new Set(companies.map((c) => c.countryCode))];
}

function toDto(row) {
    return {
        id: row.id,
        countryCode: row.countryCode,
        holidayDate: row.holidayDate,
        description: row.description,
        isActive: row.isActive,
    };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseHolidayDate(value) {
    const raw = String(value || '').trim();
    if (!DATE_ONLY.test(raw)) return null;
    const parsed = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    // Reject well-formed but impossible dates (e.g. 2026-02-31 rolls over).
    if (parsed.toISOString().slice(0, 10) !== raw) return null;
    return raw;
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/public-holidays/countries - the countries a Tenant Admin can
// maintain holidays for: the distinct Company.countryCode values of the account's
// active companies, enriched with the platform Country name + flag. The web
// screen hides the country picker entirely when this returns a single entry.
exports.listHolidayCountries = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const codes = await resolveCompanyCountryCodes(accountId);
        if (codes.length === 0) return res.status(200).json([]);

        const countries = await Country.findAll({
            where: { alpha2: codes },
            attributes: ['alpha2', 'name', 'flagEmoji'],
        });
        const byCode = new Map(countries.map((c) => [c.alpha2, c]));
        const result = codes
            .map((code) => ({
                countryCode: code,
                name: byCode.get(code)?.name || code.toUpperCase(),
                flagEmoji: byCode.get(code)?.flagEmoji || null,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        res.status(200).json(result);
    } catch (error) {
        console.error('Error listing holiday countries:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /auth/account/public-holidays - every holiday for the caller's account,
// across all countries (the screen filters client-side).
exports.listPublicHolidays = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await PublicHoliday.findAll({
            where: { accountId },
            order: [['holidayDate', 'ASC'], ['countryCode', 'ASC'], ['description', 'ASC']],
        });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing public holidays:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/public-holidays   Body: { countryCode, holidayDate, description }
exports.createPublicHoliday = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const countryCode = String(req.body.countryCode || '').trim().toLowerCase();
        if (!countryCode) return res.status(400).json({ message: 'Country is required.' });
        const allowed = await resolveCompanyCountryCodes(accountId);
        if (!allowed.includes(countryCode)) {
            return res.status(400).json({ message: 'Holidays can only be set up for countries your companies operate in.' });
        }

        const holidayDate = parseHolidayDate(req.body.holidayDate);
        if (!holidayDate) return res.status(400).json({ message: 'A valid holiday date (YYYY-MM-DD) is required.' });

        const description = String(req.body.description || '').trim();
        if (!description) return res.status(400).json({ message: 'Holiday name is required.' });

        const existing = await PublicHoliday.findOne({ where: { accountId, countryCode, holidayDate, description } });
        if (existing) return res.status(409).json({ message: `'${description}' on ${holidayDate} already exists for this country.` });

        const row = await PublicHoliday.create({ accountId, countryCode, holidayDate, description });
        res.status(201).json({ message: 'Public holiday created.', publicHoliday: toDto(row) });
    } catch (error) {
        console.error('Error creating public holiday:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/public-holidays/:id   Body: any of { countryCode, holidayDate, description, isActive }
exports.updatePublicHoliday = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await PublicHoliday.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Public holiday not found.' });

        if (typeof req.body.countryCode === 'string' && req.body.countryCode.trim()) {
            const countryCode = req.body.countryCode.trim().toLowerCase();
            if (countryCode !== row.countryCode) {
                const allowed = await resolveCompanyCountryCodes(accountId);
                if (!allowed.includes(countryCode)) {
                    return res.status(400).json({ message: 'Holidays can only be set up for countries your companies operate in.' });
                }
                row.countryCode = countryCode;
            }
        }
        if (req.body.holidayDate !== undefined) {
            const holidayDate = parseHolidayDate(req.body.holidayDate);
            if (!holidayDate) return res.status(400).json({ message: 'A valid holiday date (YYYY-MM-DD) is required.' });
            row.holidayDate = holidayDate;
        }
        if (typeof req.body.description === 'string') {
            const description = req.body.description.trim();
            if (!description) return res.status(400).json({ message: 'Holiday name is required.' });
            row.description = description;
        }
        if (row.changed('countryCode') || row.changed('holidayDate') || row.changed('description')) {
            const clash = await PublicHoliday.findOne({
                where: {
                    accountId,
                    countryCode: row.countryCode,
                    holidayDate: row.holidayDate,
                    description: row.description,
                    id: { [Op.ne]: row.id },
                },
            });
            if (clash) return res.status(409).json({ message: `'${row.description}' on ${row.holidayDate} already exists for this country.` });
        }
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Public holiday updated.', publicHoliday: toDto(row) });
    } catch (error) {
        console.error('Error updating public holiday:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/public-holidays?year=2026 - the active holidays of the caller's
// account for THE CALLER'S COMPANY'S COUNTRY, for product booking calendars.
// A company without a countryCode set gets an empty list.
exports.listActivePublicHolidays = async (req, res) => {
    try {
        if (!req.user.companyId) return res.status(200).json([]);
        const company = await Company.findByPk(req.user.companyId, { attributes: ['accountId', 'countryCode'] });
        if (!company || !company.countryCode) return res.status(200).json([]);

        const where = { accountId: company.accountId, countryCode: company.countryCode, isActive: true };
        const year = parseInt(String(req.query.year || ''), 10);
        if (!Number.isNaN(year)) {
            where.holidayDate = { [Op.gte]: `${year}-01-01`, [Op.lte]: `${year}-12-31` };
        }

        const rows = await PublicHoliday.findAll({
            where,
            attributes: ['holidayDate', 'description'],
            order: [['holidayDate', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active public holidays:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
