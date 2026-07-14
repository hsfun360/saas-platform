const { sequelize } = require('../../platform/db');
const CompanyWeekendDay = require('./companyWeekendDay.model');
const { hasTenantAdminRole } = require('./tenant');

// CompanyWeekendDay - company-level weekend/rest-day setup. Maintenance is
// Tenant-Admin per company under /auth/companies/:companyId/weekend-days
// (dialog on the Companies screen, like the SMTP config); the consumer list for
// pricing matrices (e.g. golf weekday/weekend green fees) is served to any
// workspace user under /api/weekend-days for THEIR company. A company with no
// rows is "not configured" - consumers get [] and weekend pricing never applies.

// Same guard as the SMTP endpoints: the caller must hold Tenant Admin for the
// TARGET company (not merely for their active one).
async function requireAdminFor(req, companyId) {
    if (!companyId) return { status: 400, message: 'No company specified.' };
    const allowed = await hasTenantAdminRole(req.user.id, companyId);
    if (!allowed) return { status: 403, message: "You don't have admin rights for that company." };
    return { companyId };
}

async function readWeekendDays(companyId) {
    const rows = await CompanyWeekendDay.findAll({
        where: { companyId },
        attributes: ['dayOfWeek'],
        order: [['dayOfWeek', 'ASC']],
    });
    return rows.map((r) => r.dayOfWeek);
}

// ---- Tenant self-service (Tenant Admin, per company) ----

// GET /auth/companies/:companyId/weekend-days -> { weekendDays: [6, 7] }
exports.getCompanyWeekendDays = async (req, res) => {
    const target = await requireAdminFor(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    try {
        res.status(200).json({ weekendDays: await readWeekendDays(target.companyId) });
    } catch (error) {
        console.error('Error getting company weekend days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /auth/companies/:companyId/weekend-days   Body: { weekendDays: [5, 6] }
// Replaces the whole set (checkbox save). An empty array clears the setup.
exports.setCompanyWeekendDays = async (req, res) => {
    const target = await requireAdminFor(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    try {
        const raw = req.body.weekendDays;
        if (!Array.isArray(raw)) return res.status(400).json({ message: 'weekendDays must be an array of weekday numbers (1 = Monday ... 7 = Sunday).' });
        const days = [...new Set(raw.map((d) => parseInt(d, 10)))];
        if (days.some((d) => Number.isNaN(d) || d < 1 || d > 7)) {
            return res.status(400).json({ message: 'Each weekend day must be a weekday number from 1 (Monday) to 7 (Sunday).' });
        }
        days.sort((a, b) => a - b);

        await sequelize.transaction(async (transaction) => {
            await CompanyWeekendDay.destroy({ where: { companyId: target.companyId }, transaction });
            await CompanyWeekendDay.bulkCreate(
                days.map((dayOfWeek) => ({ companyId: target.companyId, dayOfWeek })),
                { transaction },
            );
        });

        res.status(200).json({ message: 'Weekend days saved.', weekendDays: days });
    } catch (error) {
        console.error('Error setting company weekend days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/weekend-days - the weekend days of the CALLER'S company, for pricing
// matrices (weekday/weekend). [] when the company hasn't been configured.
exports.listMyWeekendDays = async (req, res) => {
    try {
        if (!req.user.companyId) return res.status(200).json([]);
        res.status(200).json(await readWeekendDays(req.user.companyId));
    } catch (error) {
        console.error('Error listing weekend days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
