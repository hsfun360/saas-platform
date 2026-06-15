// src/modules/saas/tenant.js
//
// Tenant-scoped authorization helper. A "Tenant Admin" is a user who holds the
// "Tenant Admin" role within a specific company (CompanyUser row for that
// company). Used to guard the tenant user-management endpoints.

const CompanyUser = require('./companyUser.model');
const Role = require('./role.model');

async function hasTenantAdminRole(userId, companyId) {
    if (!userId || !companyId) return false;
    const assignment = await CompanyUser.findOne({
        where: { userId, companyId },
        include: [{ model: Role, as: 'Role', where: { name: 'Tenant Admin' } }],
    });
    return !!assignment;
}

module.exports = { hasTenantAdminRole };
