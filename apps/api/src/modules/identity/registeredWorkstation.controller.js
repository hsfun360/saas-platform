// src/modules/identity/registeredWorkstation.controller.js
//
// Tenant Admin management of the organisation's registered workstations
// (System Setup -> Security Policy, 2026-11-01): list the stations, register
// the browser the administrator is sitting at, revoke one. Gated like the
// security policy itself (the Security Policy menu action); the account is
// resolved from the caller's active company, never taken from the request.

const workstations = require('./registeredWorkstation.service');
const policy = require('../saas/securityPolicy.service');

async function resolveAccount(req, res) {
    const accountId = await policy.accountIdForCompany(req.user.companyId);
    if (!accountId) {
        res.status(404).json({ message: 'Your account could not be resolved.' });
        return null;
    }
    return accountId;
}

// GET /api/auth/account/workstations
exports.list = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const rows = await workstations.listWorkstations(accountId, req);
        res.status(200).json({ workstations: rows });
    } catch (error) {
        console.error('Registered workstations list error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/account/workstations   Body: { name }
// Registers THIS browser: the cookie lands on the one making the request.
exports.register = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const result = await workstations.registerWorkstation(res, {
            accountId,
            userId: req.user.id,
            name: req.body.name,
            req,
        });
        if (result.error) return res.status(result.error).json({ message: result.message });
        console.warn('[AUTH] workstation registered', JSON.stringify({ accountId, workstationId: result.row.id, by: req.user.id, ip: req.ip }));
        const rows = await workstations.listWorkstations(accountId, req);
        res.status(201).json({
            message: result.replaced
                ? `This browser is now registered as "${result.row.name}", replacing its earlier registration.`
                : `This browser is now registered as "${result.row.name}".`,
            workstations: rows,
        });
    } catch (error) {
        console.error('Registered workstation register error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/account/workstations/:id
exports.revoke = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const row = await workstations.revokeWorkstation(accountId, req.params.id, { req, res });
        if (!row) return res.status(404).json({ message: 'That workstation is no longer registered.' });
        console.warn('[AUTH] workstation revoked', JSON.stringify({ accountId, workstationId: row.id, by: req.user.id, ip: req.ip }));
        const rows = await workstations.listWorkstations(accountId, req);
        res.status(200).json({
            message: `"${row.name}" is no longer a registered workstation. Staff signing in from it are asked for a code again.`,
            workstations: rows,
        });
    } catch (error) {
        console.error('Registered workstation revoke error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
