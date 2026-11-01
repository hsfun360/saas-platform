// src/modules/identity/trustedDevice.controller.js
//
// Self-service over the user's OWN trusted devices (Profile -> Security,
// 2026-11-01): see which browsers skip the two-factor code, and remove one or
// all of them. A removed device is asked for a code at its next sign-in; the
// password factor is untouched. Only a full session token reaches here.

const trustedDevices = require('./trustedDevice.service');

// GET /api/auth/mfa/trusted-devices
exports.list = async (req, res) => {
    try {
        const devices = await trustedDevices.listTrust(req.user.id, req);
        res.status(200).json({ devices });
    } catch (error) {
        console.error('Trusted devices list error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/mfa/trusted-devices/:id
exports.revoke = async (req, res) => {
    try {
        const ok = await trustedDevices.revokeTrust(req.user.id, req.params.id, { req, res });
        if (!ok) return res.status(404).json({ message: 'That device is no longer trusted.' });
        res.status(200).json({ message: 'Device removed. It will be asked for a code at its next sign-in.' });
    } catch (error) {
        console.error('Trusted device revoke error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/mfa/trusted-devices
exports.revokeAll = async (req, res) => {
    try {
        const revoked = await trustedDevices.revokeAllTrust(req.user.id, { req, res });
        res.status(200).json({
            revoked,
            message: revoked
                ? `${revoked} trusted ${revoked === 1 ? 'device' : 'devices'} removed. Every device will be asked for a code at its next sign-in.`
                : 'No trusted devices to remove.',
        });
    } catch (error) {
        console.error('Trusted devices revoke-all error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
