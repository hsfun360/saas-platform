// src/modules/identity/session.controller.js
//
// Self-service over the user's OWN sign-in sessions (Profile -> Security,
// 2026-11-05): see where the account is signed in right now, sign one device
// out, or sign out everywhere else. A session is a refresh-token family; the
// caller's own is the `sid` claim of the token presented, so it is marked
// "this device" and never offered for signing out here (that is Sign out).
// Only a full session token reaches here.

const { Op } = require('sequelize');
const sessions = require('./session.service');
const { describeUserAgent } = require('./trustedDevice.service');
const Company = require('../saas/company.model');

async function workspaceNames(families) {
    const ids = [...new Set(families.map((f) => f.companyId).filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await Company.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'name'] });
    return new Map(rows.map((c) => [c.id, c.name]));
}

function present(f, names, currentFamilyId) {
    return {
        id: f.familyId,
        device: describeUserAgent(f.userAgent),
        workspace: f.companyId ? (names.get(f.companyId) || 'A company') : 'System Administration',
        signedInAt: f.signedInAt,
        lastSeenAt: f.lastSeenAt,
        ip: f.ip || null,
        current: f.familyId === currentFamilyId,
    };
}

async function listFor(req) {
    const families = await sessions.liveFamilies(req.user.id, { tenantOnly: false });
    const names = await workspaceNames(families);
    const list = families.map((f) => present(f, names, req.user.sid || null));
    // Newest activity first, this device on top.
    list.sort((a, b) => (b.current - a.current) || (new Date(b.lastSeenAt) - new Date(a.lastSeenAt)));
    return list;
}

// GET /api/auth/sessions
exports.list = async (req, res) => {
    try {
        res.status(200).json({ sessions: await listFor(req) });
    } catch (error) {
        console.error('Sessions list error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/sessions/:familyId
exports.revoke = async (req, res) => {
    try {
        if (req.user.sid && req.params.familyId === req.user.sid) {
            return res.status(400).json({ message: 'This is the session you are using. Use Sign out to end it.' });
        }
        const ok = await sessions.revokeFamily(req.user.id, req.params.familyId, { exceptFamilyId: req.user.sid || null });
        if (!ok) return res.status(404).json({ message: 'That session has already ended.' });
        res.status(200).json({ message: 'Signed out on that device.', sessions: await listFor(req) });
    } catch (error) {
        console.error('Session revoke error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/sessions   - every session but this one
exports.revokeOthers = async (req, res) => {
    try {
        const ended = await sessions.revokeOtherSessions(req.user.id, req.user.sid || null);
        res.status(200).json({
            ended,
            message: ended
                ? `Signed out on ${ended} other ${ended === 1 ? 'device' : 'devices'}.`
                : 'You are not signed in anywhere else.',
            sessions: await listFor(req),
        });
    } catch (error) {
        console.error('Sessions revoke-others error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
