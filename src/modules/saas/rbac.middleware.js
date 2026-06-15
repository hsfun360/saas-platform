// src/modules/saas/rbac.middleware.js

const CompanyUser = require('./companyUser.model');
const Role = require('./role.model');

// Middleware to strictly protect internal SaaS admin routes.
//
// Authorization is DB-backed: the user must hold the seeded "System Admin" role
// at the system level (a CompanyUser row with companyId = NULL). The ADMIN_EMAILS
// env list is kept ONLY as a break-glass recovery path (e.g. to regain access if
// the role assignment is ever lost) — it is no longer the primary mechanism.
exports.isSystemAdmin = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;

        // 1. Primary check: does the user hold the System Admin role (companyId = NULL)?
        if (userId) {
            const systemAssignment = await CompanyUser.findOne({
                where: { userId, companyId: null },
                include: [{ model: Role, as: 'Role', where: { name: 'System Admin' } }],
            });

            if (systemAssignment) {
                return next();
            }
        }

        // 2. Break-glass fallback: ADMIN_EMAILS allowlist (recovery only).
        const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
        if (userEmail && adminEmails.includes(userEmail.toLowerCase())) {
            console.warn(`[RBAC] System admin granted via ADMIN_EMAILS break-glass for ${userEmail}. Assign the "System Admin" role in the DB to make this permanent.`);
            return next();
        }

        return res.status(403).json({
            message: "Access Denied: You do not have System Administrator privileges.",
        });
    } catch (error) {
        console.error("System Admin Auth Error:", error);
        res.status(500).json({ message: "Internal server error during authorization check." });
    }
};
