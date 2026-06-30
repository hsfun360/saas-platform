// src/platform/serviceContext.js
//
// INTER-SERVICE CONTRACT SEAM.
//
// Today everything runs in one process (modular monolith). The core product
// services (membership, golf, facility) must NOT reach into the Control Plane's
// models directly — they depend on THIS thin contract instead. When a service is
// split out into its own deployment, only the implementations in this file change
// (in-process lookup -> HTTP call / signed claim); the callers never change.
//
// See docs/systems/saas-platform.md ("How services talk to each other").

const { verifyToken } = require('./auth.middleware');

// --- WHO is calling -------------------------------------------------------
// Derived from the VERIFIED JWT (Identity is the source of truth). Services only
// read verified claims here; they never re-authenticate against Identity.
function getUserContext(req) {
    const u = req.user || {};
    return {
        userId: u.id || null,
        email: u.email || null,
        companyId: u.companyId || null, // the active workspace
        isSystemAdmin: !!u.isSystemAdmin,
    };
}

// --- ARE they entitled ----------------------------------------------------
// Express middleware: the caller's active company must be subscribed to
// `moduleName` (a Control-Plane concern). System admins bypass.
//
// IN-PROCESS IMPLEMENTATION (monolith): looks the subscription up via the
// Control-Plane models. The model requires are done lazily *inside* the handler
// so this file has no load-time dependency on the saas module (keeps the seam
// clean and avoids require cycles).
//
// WHEN SPLIT: replace the marked block with a call to the Control Plane, e.g.
//   GET {control-plane}/api/admin/entitlements?companyId=<>&module=<>
// or validate a signed entitlements claim carried on the JWT. Callers unchanged.
function requireModule(moduleName) {
    return async (req, res, next) => {
        try {
            const { companyId, isSystemAdmin } = getUserContext(req);
            if (isSystemAdmin) return next(); // platform admin bypass
            if (!companyId) {
                return res.status(403).json({ message: 'No active workspace selected.' });
            }

            // ----- in-process entitlement lookup (Control-Plane owned) -----
            const Module = require('../modules/saas/module.model');
            const CompanyModule = require('../modules/saas/companyModule.model');

            const mod = await Module.findOne({ where: { name: moduleName }, attributes: ['id'] });
            if (!mod) {
                return res.status(403).json({ message: `The "${moduleName}" module is not available.` });
            }
            const subscribed = await CompanyModule.findOne({
                where: { companyId, moduleId: mod.id },
                attributes: ['companyId'],
            });
            if (!subscribed) {
                return res.status(403).json({ message: `Your workspace is not subscribed to ${moduleName}.` });
            }
            return next();
            // ----- end in-process block (swap for a service call when split) -----
        } catch (err) {
            console.error('requireModule entitlement check failed:', err);
            return res.status(500).json({ message: 'Entitlement check failed.' });
        }
    };
}

// --- CALLING another service ---------------------------------------------
// Resolve the base URL of a peer service. In the monolith this is null (same
// process / same gateway). When a service is split out, set its env var
// (e.g. MEMBERSHIP_SERVICE_URL) and core services route peer calls through here
// instead of require()-ing each other's code.
function internalServiceUrl(serviceName) {
    const key = `${serviceName.toUpperCase()}_SERVICE_URL`;
    return process.env[key] || null; // null => in-process (monolith)
}

module.exports = {
    verifyToken,        // re-exported so services import auth from one seam
    getUserContext,
    requireModule,
    internalServiceUrl,
};
