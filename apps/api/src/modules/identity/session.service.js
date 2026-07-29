// src/modules/identity/session.service.js
//
// Refresh-token sessions behind the httpOnly cookie. Access JWTs are short
// (1h); this is what keeps a user signed in - 24h normally, 30 days with
// "Keep me signed in" - and what makes revocation real (sign-out kills the
// family; a replayed rotated-out token is treated as theft and kills it too).

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const RefreshToken = require('./refreshToken.model');

const COOKIE_NAME = 'rt';
// Scoped to the auth gateway path so product APIs never even receive it.
const COOKIE_PATH = '/api/auth';

const DAY_MS = 24 * 60 * 60 * 1000;
const NORMAL_TTL_MS = DAY_MS;           // session without "Keep me signed in"
const REMEMBERED_TTL_MS = 30 * DAY_MS;  // with it

const hashRt = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

// SameSite policy is env-driven so the same image works before and after the
// same-origin cutover. Cross-origin (web on run.app, API on a different run.app
// host) REQUIRES 'none'. Once the app and API share one origin behind the
// myeasysoft.com load balancer (/api/* path-routed to login-api), set
// COOKIE_SAMESITE=lax so the refresh cookie is first-party - a strictly
// stronger CSRF posture. Default stays 'none' to preserve current behaviour.
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'none').toLowerCase();

function cookieOptions(maxAgeMs) {
    return {
        httpOnly: true,
        secure: true,       // always: 'none' requires it and 'lax' over HTTPS wants it; localhost is exempted by browsers
        sameSite: COOKIE_SAMESITE,
        path: COOKIE_PATH,
        maxAge: maxAgeMs,
    };
}

// Create a session (new family) and set the cookie. Returns the row.
async function issueSession(res, { userId, companyId, rememberMe, req }) {
    const raw = crypto.randomBytes(32).toString('hex');
    const ttl = rememberMe ? REMEMBERED_TTL_MS : NORMAL_TTL_MS;
    const row = await RefreshToken.create({
        userId,
        companyId: companyId || null,
        tokenHash: hashRt(raw),
        familyId: uuidv4(),
        expiresAt: new Date(Date.now() + ttl),
        userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 400) : null,
        ip: req ? String(req.ip || '').slice(0, 64) : null,
    });
    res.cookie(COOKIE_NAME, raw, cookieOptions(ttl));
    return row;
}

// Rotate the presented cookie value. Returns the fresh row (with the new raw
// set on the cookie), or null when the token is unknown/expired/revoked.
// Replay of a ROTATED token = theft signal -> the entire family is revoked.
async function rotateSession(req, res) {
    const raw = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!raw) return null;

    const row = await RefreshToken.findOne({ where: { tokenHash: hashRt(raw) } });
    if (!row) return null;

    if (row.revokedAt) return null;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
    if (row.rotatedAt) {
        // Someone is replaying an already-rotated token: kill the family.
        await RefreshToken.update(
            { revokedAt: new Date() },
            { where: { familyId: row.familyId, revokedAt: null } },
        );
        console.warn(`[SESSION] rotated-token replay for user ${row.userId} - family revoked.`);
        return null;
    }

    const newRaw = crypto.randomBytes(32).toString('hex');
    const remainingMs = new Date(row.expiresAt).getTime() - Date.now();
    const fresh = await RefreshToken.create({
        userId: row.userId,
        companyId: row.companyId,
        tokenHash: hashRt(newRaw),
        familyId: row.familyId,
        // The family keeps its ORIGINAL horizon - refreshing never extends it.
        expiresAt: row.expiresAt,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 400),
        ip: String(req.ip || '').slice(0, 64),
    });
    row.rotatedAt = new Date();
    await row.save();
    res.cookie(COOKIE_NAME, newRaw, cookieOptions(Math.max(remainingMs, 60 * 1000)));
    return fresh;
}

// Revoke the presented session's family (sign out) and clear the cookie.
async function revokeSession(req, res) {
    const raw = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (raw) {
        const row = await RefreshToken.findOne({ where: { tokenHash: hashRt(raw) } });
        if (row) {
            await RefreshToken.update(
                { revokedAt: new Date() },
                { where: { familyId: row.familyId, revokedAt: null } },
            );
        }
    }
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(0), maxAge: undefined });
}

// Revoke EVERY session of a user (password change / admin action).
async function revokeAllSessions(userId) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
}

// Was this session opened with "Keep me signed in"? Derived from its horizon.
function isRemembered(row) {
    return new Date(row.expiresAt).getTime() - new Date(row.createdAt).getTime() > 2 * DAY_MS;
}

module.exports = { issueSession, rotateSession, revokeSession, revokeAllSessions, isRemembered };
