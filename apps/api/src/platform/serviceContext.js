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

// --- WHICH companies share the caller's subscription ----------------------
// Resolve the sibling companies under the same Account (subscription) as the
// caller's active workspace. A Control-Plane concern, exposed here as a seam so
// product services never query Account/Company directly.
//
// IN-PROCESS IMPLEMENTATION (monolith): looks up the active company's accountId,
// then every company under that account. The Company require is lazy (inside the
// call) to keep this file free of a load-time dependency on the saas module.
//
// WHEN SPLIT: replace the body with a Control-Plane call, e.g.
//   GET {control-plane}/api/admin/accounts/<accountId>/companies
// Callers (e.g. the membership "copy from sibling" feature) never change.
// Returns [{ id, name }] including the caller's own company; callers filter it
// out when they want only the siblings.
async function listSubscriptionCompanies(req) {
    const { companyId } = getUserContext(req);
    if (!companyId) return [];

    const Company = require('../modules/saas/company.model');
    const current = await Company.findByPk(companyId, { attributes: ['id', 'accountId'] });
    if (!current || !current.accountId) return [];

    const companies = await Company.findAll({
        where: { accountId: current.accountId },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
    });
    return companies.map((c) => ({ id: c.id, name: c.name }));
}

// --- WHICH subscriber (Account) owns the caller's workspace ---------------
// Resolve the accountId behind the caller's active company. Subscriber-level
// master files (tax schemes, currency/language selection, …) are keyed by
// accountId, but a product service must not query Company directly - it asks here.
//
// IN-PROCESS IMPLEMENTATION (monolith): looks the company up. Lazy require keeps
// this file free of a load-time dependency on the saas module.
//
// WHEN SPLIT: replace with a Control-Plane call, e.g.
//   GET {control-plane}/api/admin/companies/<companyId> -> { accountId }
// Returns null when there is no active workspace (e.g. the System Admin console).
async function getActiveAccountId(req) {
    const { companyId } = getUserContext(req);
    if (!companyId) return null;

    const Company = require('../modules/saas/company.model');
    const current = await Company.findByPk(companyId, { attributes: ['accountId'] });
    return current ? current.accountId : null;
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
    getActiveAccountId,
    requireModule,
    listSubscriptionCompanies,
    internalServiceUrl,
};
