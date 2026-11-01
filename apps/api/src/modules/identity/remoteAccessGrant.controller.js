// src/modules/identity/remoteAccessGrant.controller.js
//
// Remote-access grants (2026-11-01): the exception to the registered-
// workstation lock.
//   - the REQUEST comes from the sign-in screen with the purpose-scoped
//     'remote-access' token the gate handed out on refusal (no session exists
//     yet), rate-limited like the login itself;
//   - the DECISIONS (approve / reject / grant in advance / revoke) come from
//     System Setup -> Access Requests, gated by that menu's action; the
//     account is resolved from the caller's active company.

const jwt = require('jsonwebtoken');
const { getPublicKey } = require('../../platform/jwt.keys');
const grants = require('./remoteAccessGrant.service');
const policy = require('../saas/securityPolicy.service');

async function resolveAccount(req, res) {
    const accountId = await policy.accountIdForCompany(req.user.companyId);
    if (!accountId) {
        res.status(404).json({ message: 'Your account could not be resolved.' });
        return null;
    }
    return accountId;
}

// POST /api/auth/remote-access/request   Body: { token, reason? }
exports.request = async (req, res) => {
    try {
        let claims;
        try {
            claims = jwt.verify(req.body.token, getPublicKey(), { algorithms: ['RS256'] });
        } catch (e) {
            return res.status(401).json({ message: 'Your sign-in expired. Please log in again, then ask for remote access.' });
        }
        if (claims.purpose !== 'remote-access' || !claims.id) {
            return res.status(401).json({ message: 'Your sign-in expired. Please log in again, then ask for remote access.' });
        }
        const accountId = await policy.accountIdForCompany(claims.companyId || null);
        if (!accountId) return res.status(400).json({ message: 'That workspace has no organisation to ask.' });

        const out = await grants.requestRemoteAccess({ accountId, userId: claims.id, reason: req.body.reason, req });
        if (out.error) return res.status(out.error).json({ message: out.message });
        console.warn('[AUTH] remote access requested', JSON.stringify({ accountId, userId: claims.id, requestId: out.row.id, refreshed: out.refreshed, approvers: out.approvers, ip: req.ip }));
        res.status(out.refreshed ? 200 : 201).json({
            message: out.refreshed
                ? 'Your earlier request is still waiting; your administrator has been reminded. You will be emailed when it is decided.'
                : 'Your request has been sent to your administrator. You will be emailed when it is decided.',
            pending: true,
        });
    } catch (error) {
        console.error('Remote access request error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function maxDaysFor(accountId) {
    const state = await policy.remoteAccessPolicyForAccount(accountId);
    return state.maxDays;
}

// GET /api/auth/account/remote-access
exports.list = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const out = await grants.listGrants(accountId);
        res.status(200).json({ ...out, maxDays: await maxDaysFor(accountId) });
    } catch (error) {
        console.error('Remote access list error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/account/remote-access/:id/approve   Body: { days, note? }
exports.approve = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const out = await grants.approveRequest({
            accountId, id: req.params.id, days: req.body.days, note: req.body.note, deciderUserId: req.user.id, maxDays: await maxDaysFor(accountId),
        });
        if (out.error) return res.status(out.error).json({ message: out.message });
        console.warn('[AUTH] remote access approved', JSON.stringify({ accountId, grantId: out.row.id, userId: out.row.userId, by: req.user.id, validUntil: out.row.validUntil }));
        const list = await grants.listGrants(accountId);
        res.status(200).json({ message: 'Remote access approved. The person has been told.', ...list });
    } catch (error) {
        console.error('Remote access approve error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/account/remote-access/:id/reject   Body: { note? }
exports.reject = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const out = await grants.rejectRequest({ accountId, id: req.params.id, note: req.body.note, deciderUserId: req.user.id });
        if (out.error) return res.status(out.error).json({ message: out.message });
        console.warn('[AUTH] remote access rejected', JSON.stringify({ accountId, grantId: out.row.id, userId: out.row.userId, by: req.user.id }));
        const list = await grants.listGrants(accountId);
        res.status(200).json({ message: 'Request declined. The person has been told.', ...list });
    } catch (error) {
        console.error('Remote access reject error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/account/remote-access/grants   Body: { userId, days, note? }
exports.grant = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const out = await grants.grantRemoteAccess({
            accountId, userId: req.body.userId, days: req.body.days, note: req.body.note, deciderUserId: req.user.id, maxDays: await maxDaysFor(accountId),
        });
        if (out.error) return res.status(out.error).json({ message: out.message });
        console.warn('[AUTH] remote access granted', JSON.stringify({ accountId, grantId: out.row.id, userId: out.row.userId, by: req.user.id, validUntil: out.row.validUntil }));
        const list = await grants.listGrants(accountId);
        res.status(201).json({ message: 'Remote access granted. The person has been told.', ...list });
    } catch (error) {
        console.error('Remote access grant error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/account/remote-access/:id
exports.revoke = async (req, res) => {
    try {
        const accountId = await resolveAccount(req, res);
        if (!accountId) return;
        const row = await grants.revokeGrant({ accountId, id: req.params.id });
        if (!row) return res.status(404).json({ message: 'That grant is not in force.' });
        console.warn('[AUTH] remote access revoked', JSON.stringify({ accountId, grantId: row.id, userId: row.userId, by: req.user.id }));
        const list = await grants.listGrants(accountId);
        res.status(200).json({ message: 'Remote access revoked. The lock applies again at their next sign-in.', ...list });
    } catch (error) {
        console.error('Remote access revoke error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
