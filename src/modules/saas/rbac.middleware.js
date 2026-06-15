// src/modules/saas/rbac.middleware.js

const { hasSystemAdminRole, isBreakGlassAdmin } = require('./systemAdmin');

// Middleware to strictly protect internal SaaS admin routes.
//
// Authorization is DB-backed (see ./systemAdmin): the user must hold the seeded
// "System Admin" role at the system level (CompanyUser with companyId = NULL).
// The ADMIN_EMAILS env list is kept ONLY as a break-glass recovery path.
exports.isSystemAdmin = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;

        // 1. Primary check: does the user hold the System Admin role?
        if (await hasSystemAdminRole(userId)) {
            return next();
        }

        // 2. Break-glass fallback: ADMIN_EMAILS allowlist (recovery only).
        if (isBreakGlassAdmin(userEmail)) {
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
