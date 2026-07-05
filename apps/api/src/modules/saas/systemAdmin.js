// src/modules/saas/systemAdmin.js
//
// Single source of truth for "is this user a system administrator?".
//
// Authorization is DB-backed: the user must hold the seeded "System Admin" role
// at the system level (a CompanyUser row with companyId = NULL). The ADMIN_EMAILS
// env list is kept ONLY as a break-glass recovery path.
//
// Used by both the login flow (to stamp the JWT `isSystemAdmin` claim) and the
// rbac middleware (to guard /admin routes), so the two never drift apart.

const CompanyUser = require('./companyUser.model');
const Role = require('./role.model');

// DB check: does the user hold the System Admin role at system level?
async function hasSystemAdminRole(userId) {
    if (!userId) return false;
    const assignment = await CompanyUser.findOne({
        where: { userId, companyId: null, isActive: true },
        include: [{ model: Role, as: 'Role', where: { name: 'System Admin' } }],
    });
    return !!assignment;
}

// Break-glass: is the email on the ADMIN_EMAILS allowlist? (recovery only)
function isBreakGlassAdmin(email) {
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
    return !!email && adminEmails.includes(email.toLowerCase());
}

// Combined check used by the login flow.
async function isUserSystemAdmin(userId, email) {
    if (await hasSystemAdminRole(userId)) return true;
    return isBreakGlassAdmin(email);
}

module.exports = { isUserSystemAdmin, hasSystemAdminRole, isBreakGlassAdmin };
