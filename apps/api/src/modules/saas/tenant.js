// src/modules/saas/tenant.js
//
// Tenant-scoped authorization helper. A user counts as a "Tenant Admin" of a
// company if EITHER they hold the per-company "Tenant Admin" role (a CompanyUser
// row for that company) OR they are the owner (SuperUser) of the account that
// owns the company - an account owner administers every company under it.

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

// May the caller administer `companyId` from THIS request? The caller's own
// active company was already admitted by the route's System Setup menu gate
// (requireMenuAction, 2026-10-12), so a custom role granted the screen passes;
// any OTHER company of the subscriber (the account-wide screens' ?companyId=)
// still needs the role or ownership rule above.
async function canAdministerCompany(req, companyId) {
    if (!req || !req.user || !companyId) return false;
    if (req.user.companyId && companyId === req.user.companyId) return true;
    return hasTenantAdminRole(req.user.id, companyId);
}

module.exports = { hasTenantAdminRole, canAdministerCompany };
