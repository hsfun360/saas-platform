const Company = require('./company.model');
const Department = require('./department.model');

// Department - subscriber-owned reference data. Maintenance is Tenant-Admin
// self-service under /auth/account/departments (the auth router applies
// authenticateToken + requireTenant + requireTenantAdmin); the active list for
// pickers (e.g. User Management assignment) is served to any workspace user
// under /api/departments. Same pattern as IndustryType.

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
        departmentCode: row.departmentCode,
        description: row.description,
        isActive: row.isActive,
    };
}

// ---- Tenant self-service (Tenant Admin) ----

// GET /auth/account/departments - every department for the caller's account.
exports.listDepartments = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const rows = await Department.findAll({ where: { accountId }, order: [['departmentCode', 'ASC']] });
        res.status(200).json(rows.map(toDto));
    } catch (error) {
        console.error('Error listing departments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /auth/account/departments   Body: { departmentCode, description? }
exports.createDepartment = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const departmentCode = String(req.body.departmentCode || '').trim();
        if (!departmentCode) return res.status(400).json({ message: 'Department code is required.' });
        const description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null;

        const existing = await Department.findOne({ where: { accountId, departmentCode } });
        if (existing) return res.status(409).json({ message: `Department '${departmentCode}' already exists.` });

        const row = await Department.create({ accountId, departmentCode, description });
        res.status(201).json({ message: 'Department created.', department: toDto(row) });
    } catch (error) {
        console.error('Error creating department:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /auth/account/departments/:id   Body: any of { departmentCode, description, isActive }
exports.updateDepartment = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const row = await Department.findOne({ where: { id: req.params.id, accountId } });
        if (!row) return res.status(404).json({ message: 'Department not found.' });

        if (typeof req.body.departmentCode === 'string' && req.body.departmentCode.trim()) {
            const departmentCode = req.body.departmentCode.trim();
            if (departmentCode !== row.departmentCode) {
                const clash = await Department.findOne({ where: { accountId, departmentCode } });
                if (clash) return res.status(409).json({ message: `Department '${departmentCode}' already exists.` });
                row.departmentCode = departmentCode;
            }
        }
        if (typeof req.body.description === 'string') row.description = req.body.description.trim() || null;
        if (typeof req.body.isActive === 'boolean') row.isActive = req.body.isActive;
        await row.save();

        res.status(200).json({ message: 'Department updated.', department: toDto(row) });
    } catch (error) {
        console.error('Error updating department:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Consumers (any authenticated workspace user) ----

// GET /api/departments - the active departments of the caller's account,
// for assignment pickers and future product screens.
exports.listActiveDepartments = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(200).json([]);

        const rows = await Department.findAll({
            where: { accountId, isActive: true },
            attributes: ['id', 'departmentCode', 'description'],
            order: [['departmentCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing active departments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
