// src/modules/saas/securityPolicy.controller.js
//
// Tenant Admin self-service for the subscriber's security policy (System Setup
// -> Security Policy). Same shape as the account-languages pair: resolve the
// caller's account from their active company, read or replace the setting,
// answer with the full state so the screen never guesses.

const policy = require('./securityPolicy.service');

// GET /auth/account/security-policy
exports.getSecurityPolicy = async (req, res) => {
    try {
        const accountId = await policy.accountIdForCompany(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const state = await policy.getSecurityPolicyState(accountId);
        if (!state) return res.status(404).json({ message: 'Account not found.' });
        res.status(200).json(state);
    } catch (error) {
        console.error('Error getting security policy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /auth/account/security-policy   Body: { mfaPolicy, mfaRequiredFrom? }
exports.updateSecurityPolicy = async (req, res) => {
    try {
        const accountId = await policy.accountIdForCompany(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const result = await policy.applySecurityPolicy(accountId, req.body);
        if (result.error) return res.status(result.error).json({ message: result.message });
        const state = await policy.getSecurityPolicyState(accountId);
        res.status(200).json({ message: 'Security policy updated.', ...state });
    } catch (error) {
        console.error('Error updating security policy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
