// src/modules/identity/trustedDevice.service.js
//
// "Don't ask again on this device" for the MFA step-up. After a successful
// code entry with the checkbox ticked, the browser gets a second httpOnly
// cookie ('td', 30 days) whose SHA-256 is stored in TrustedDevice. On later
// logins completeLogin consults it BEFORE issuing the MFA challenge: a valid
// row for the SAME user skips the code step. The cookie is not an
// authenticator - the password (or SSO) is still required every login - so it
// deliberately survives sign-out, unlike the refresh cookie.

const crypto = require('crypto');
const TrustedDevice = require('./trustedDevice.model');

const COOKIE_NAME = 'td';
// Same scoping as the refresh cookie: only the auth gateway ever sees it.
const COOKIE_PATH = '/api/auth';

const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, approved 2026-07-30

const hashTd = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

// SameSite mirrors the refresh cookie's env-driven policy (see session.service).
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'none').toLowerCase();

function cookieOptions(maxAgeMs) {
    return {
        httpOnly: true,
        secure: true,
        sameSite: COOKIE_SAMESITE,
        path: COOKIE_PATH,
        maxAge: maxAgeMs,
    };
}

// Trust the presented browser for the user: row + cookie. Called only after a
// verified MFA code with rememberDevice requested.
async function issueTrust(res, { userId, req }) {
    const raw = crypto.randomBytes(32).toString('hex');
    const row = await TrustedDevice.create({
        userId,
        tokenHash: hashTd(raw),
        expiresAt: new Date(Date.now() + TRUST_TTL_MS),
        userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 400) : null,
        ip: req ? String(req.ip || '').slice(0, 64) : null,
    });
    res.cookie(COOKIE_NAME, raw, cookieOptions(TRUST_TTL_MS));
    return row;
}

// Does this request carry a live trust cookie for THIS user? Stamps lastUsedAt
// on a hit. A cookie belonging to another user (shared browser) is simply not
// a match - it stays untouched for its owner.
async function hasValidTrust(req, userId) {
    const raw = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!raw) return false;

    const row = await TrustedDevice.findOne({ where: { tokenHash: hashTd(raw) } });
    if (!row) return false;
    if (row.userId !== userId) return false;
    if (row.revokedAt) return false;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return false;

    row.lastUsedAt = new Date();
    await row.save();
    return true;
}

// Revoke EVERY trusted device of a user. Called when the MFA factor or the
// password can no longer be presumed intact: MFA disable, admin MFA reset,
// password change/reset.
async function revokeAllTrust(userId) {
    await TrustedDevice.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
}

module.exports = { issueTrust, hasValidTrust, revokeAllTrust };
