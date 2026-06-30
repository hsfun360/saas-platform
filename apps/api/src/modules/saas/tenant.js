// src/modules/saas/tenant.js
//
// Tenant-scoped authorization helper. A user counts as a "Tenant Admin" of a
// company if EITHER they hold the per-company "Tenant Admin" role (a CompanyUser
// row for that company) OR they are the owner (SuperUser) of the account that
// owns the company — an account owner administers every company under it.

const CompanyUser = require('./companyUser.model');
const Role = require('./role.model');
const { isAccountAdminForCompany } = require('./account');

async function hasTenantAdminRole(userId, companyId) {
    if (!userId || !companyId) return false;

    const assignment = await CompanyUser.findOne({
        where: { userId, companyId },
        include: [{ model: Role, as: 'Role', where: { name: 'Tenant Admin' } }],
    });
    if (assignment) return true;

    // Subscriber SuperUser: the account owner administers every company.
    return isAccountAdminForCompany(userId, companyId);
}

module.exports = { hasTenantAdminRole };
