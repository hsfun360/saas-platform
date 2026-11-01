// src/modules/identity/trustedDevice.service.js
//
// "Don't ask again on this device" for the MFA step-up. After a successful
// code entry with the checkbox ticked, the browser gets a second httpOnly
// cookie ('td') whose SHA-256 is stored in TrustedDevice. On later logins
// completeLogin consults it BEFORE issuing the MFA challenge: a valid row for
// the SAME user skips the code step. The cookie is not an authenticator - the
// password (or SSO) is still required every login - so it deliberately
// survives sign-out, unlike the refresh cookie.
//
// Two things were added on 2026-11-01:
//   - the subscriber decides whether trusted devices count at all and for how
//     long (Account.mfaTrustedDevicesAllowed / mfaTrustedDeviceDays, read
//     through saas/securityPolicy.service); the caller passes the window in,
//     and a row older than the CURRENT window is ignored even though it was
//     issued under a longer one, so shortening the policy bites at once;
//   - the user sees and revokes their own trusted devices (Profile ->
//     Security), per device or all at once.

const crypto = require('crypto');
const { Op } = require('sequelize');
const TrustedDevice = require('./trustedDevice.model');

const COOKIE_NAME = 'td';
// Same scoping as the refresh cookie: only the auth gateway ever sees it.
const COOKIE_PATH = '/api/auth';

const DAY_MS = 24 * 60 * 60 * 1000;
// The platform default (approved 2026-07-30); a subscriber may shorten it.
const DEFAULT_TRUST_DAYS = 30;

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

// The raw cookie this request carries, if any.
function presentedToken(req) {
    return req && req.cookies ? req.cookies[COOKIE_NAME] || null : null;
}

// Drop the cookie from the browser that just revoked its own trust, so it does
// not keep presenting a dead token. Express 5's clearCookie sets the expiry
// itself; the scoping attributes must match the ones the cookie was set with.
function clearTrustCookie(res) {
    if (!res || typeof res.clearCookie !== 'function') return;
    const { maxAge, ...scope } = cookieOptions(0);
    res.clearCookie(COOKIE_NAME, scope);
}

// Trust the presented browser for the user: row + cookie. Called only after a
// verified MFA code with rememberDevice requested AND the account allowing it.
async function issueTrust(res, { userId, req, ttlDays = DEFAULT_TRUST_DAYS }) {
    const ttlMs = ttlDays * DAY_MS;
    const raw = crypto.randomBytes(32).toString('hex');
    const row = await TrustedDevice.create({
        userId,
        tokenHash: hashTd(raw),
        expiresAt: new Date(Date.now() + ttlMs),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 400),
        ip: String(req.ip || '').slice(0, 64),
    });
    res.cookie(COOKIE_NAME, raw, cookieOptions(ttlMs));
    return row;
}

// Is this row a live trust for the user under the window in force today?
// Pure, so the rule is unit-tested without a DB.
function trustIsLive(row, { userId, maxAgeDays, now = Date.now() } = {}) {
    if (!row) return false;
    if (userId && row.userId !== userId) return false;
    if (row.revokedAt) return false;
    if (new Date(row.expiresAt).getTime() <= now) return false;
    // The account may have shortened its window after this row was issued.
    if (maxAgeDays && new Date(row.createdAt).getTime() + maxAgeDays * DAY_MS <= now) return false;
    return true;
}

// Does the request carry a live trusted-device cookie for this user? Stamps
// lastUsedAt on a hit (never extends expiry).
async function hasValidTrust(req, userId, { maxAgeDays } = {}) {
    const raw = presentedToken(req);
    if (!raw) return false;

    const row = await TrustedDevice.findOne({ where: { tokenHash: hashTd(raw) } });
    if (!trustIsLive(row, { userId, maxAgeDays })) return false;

    row.lastUsedAt = new Date();
    await row.save();
    return true;
}

// A human label for the stored user agent: "Chrome on Windows", "Safari on
// iPhone". Order matters: an iPhone UA also says "like Mac OS X", an Android UA
// also says "Linux", Edge and Opera also say "Chrome", Chrome also says
// "Safari".
function describeUserAgent(ua) {
    const s = String(ua || '');
    if (!s.trim()) return 'Unknown device';
    let os = 'an unknown device';
    if (/Windows/i.test(s)) os = 'Windows';
    else if (/iPhone/i.test(s)) os = 'iPhone';
    else if (/iPad/i.test(s)) os = 'iPad';
    else if (/Android/i.test(s)) os = 'Android';
    else if (/Mac OS X|Macintosh/i.test(s)) os = 'Mac';
    else if (/CrOS/i.test(s)) os = 'Chromebook';
    else if (/Linux/i.test(s)) os = 'Linux';
    let browser = 'Browser';
    if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
    else if (/SamsungBrowser/.test(s)) browser = 'Samsung Internet';
    else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
    else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
    else if (/Safari\//.test(s)) browser = 'Safari';
    return `${browser} on ${os}`;
}

// What the Profile card shows for one row. `current` marks the browser making
// the request (its cookie hashes to this row), so the user can tell "this
// device" from the rest. The hash itself never leaves the server.
function presentTrust(row, currentHash) {
    return {
        id: row.id,
        device: describeUserAgent(row.userAgent),
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        lastUsedAt: row.lastUsedAt || null,
        ip: row.ip || null,
        current: !!currentHash && row.tokenHash === currentHash,
    };
}

// The user's live trusted devices (not revoked, not expired), newest first.
async function listTrust(userId, req) {
    const rows = await TrustedDevice.findAll({
        where: { userId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
        order: [['createdAt', 'DESC']],
    });
    const raw = presentedToken(req);
    const currentHash = raw ? hashTd(raw) : null;
    return rows.map((row) => presentTrust(row, currentHash));
}

// Revoke ONE of the user's trusted devices (self-service). Returns false when
// the row is not theirs or already revoked. Clears the cookie when the device
// being removed is the one making the request.
async function revokeTrust(userId, id, { req, res } = {}) {
    const row = await TrustedDevice.findOne({ where: { id, userId } });
    if (!row || row.revokedAt) return false;
    row.revokedAt = new Date();
    await row.save();
    const raw = presentedToken(req);
    if (raw && hashTd(raw) === row.tokenHash) clearTrustCookie(res);
    return true;
}

// Revoke EVERY trusted device of a user. Called when the MFA factor or the
// password can no longer be presumed intact (MFA disable, admin MFA reset,
// password change/reset) and by the user's own "Remove all". Returns the count.
async function revokeAllTrust(userId, { req, res } = {}) {
    const [count] = await TrustedDevice.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
    if (presentedToken(req)) clearTrustCookie(res);
    return count || 0;
}

module.exports = {
    DEFAULT_TRUST_DAYS,
    issueTrust,
    hasValidTrust,
    trustIsLive,
    describeUserAgent,
    listTrust,
    revokeTrust,
    revokeAllTrust,
};
