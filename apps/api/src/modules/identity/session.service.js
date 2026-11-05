// src/modules/identity/session.service.js
//
// Refresh-token sessions behind the httpOnly cookie. Access JWTs are short
// (1h); this is what keeps a user signed in - 24h normally, 30 days with
// "Keep me signed in" - and what makes revocation real (sign-out kills the
// family; a replayed rotated-out token is treated as theft and kills it too).
//
// Concurrent-session limit (approved 2026-11-05): a session is a rotation
// family, so "one device at a time" means one live family per user in the
// account's companies. issueSession() is handed the limit that applies and
// ENDS the idlest families beyond it before creating the new one ("newest
// wins"), stamping each with the new family's id (supersededByFamilyId) so
// the ended browser can be told why. The access token carries the family id
// as the `sid` claim and every request checks the family is still live
// (sessionIsLive), so the ended browser is signed out on its next request,
// not an hour later.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const RefreshToken = require('./refreshToken.model');

const COOKIE_NAME = 'rt';
// Scoped to the auth gateway path so product APIs never even receive it.
const COOKIE_PATH = '/api/auth';

const DAY_MS = 24 * 60 * 60 * 1000;
const NORMAL_TTL_MS = DAY_MS;           // session without "Keep me signed in"
const REMEMBERED_TTL_MS = 30 * DAY_MS;  // with it

const hashRt = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

// Why a session is no longer live. 'superseded' = ended by a newer sign-in
// under the session limit; 'ended' = signed out, revoked or expired.
const SESSION_SUPERSEDED = 'session_superseded';
const SESSION_ENDED = 'session_ended';

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

// One entry per live family from the rows of a user, newest activity last.
// A family's activity is its newest row's lastSeenAt (falling back to
// createdAt); its device and address are that newest row's.
function groupFamilies(rows) {
    const byFamily = new Map();
    for (const r of rows) {
        const seen = new Date(r.lastSeenAt || r.createdAt).getTime();
        const f = byFamily.get(r.familyId);
        if (!f) {
            byFamily.set(r.familyId, { familyId: r.familyId, companyId: r.companyId, signedInAt: new Date(r.createdAt), lastSeenAt: new Date(seen), userAgent: r.userAgent, ip: r.ip });
            continue;
        }
        if (seen >= f.lastSeenAt.getTime()) { f.lastSeenAt = new Date(seen); f.userAgent = r.userAgent; f.ip = r.ip; }
        if (new Date(r.createdAt) < f.signedInAt) f.signedInAt = new Date(r.createdAt);
    }
    return [...byFamily.values()].sort((a, b) => a.lastSeenAt - b.lastSeenAt);
}

// The live sessions of a user, idlest first. `tenantOnly` leaves out the
// platform (System Administration) sessions, which carry a NULL companyId:
// the limit is the tenant's and does not count them; the Profile list shows
// them all.
async function liveFamilies(userId, { tenantOnly = true, now = new Date() } = {}) {
    const where = { userId, revokedAt: null, expiresAt: { [Op.gt]: now } };
    if (tenantOnly) where.companyId = { [Op.ne]: null };
    const rows = await RefreshToken.findAll({
        where,
        attributes: ['familyId', 'companyId', 'createdAt', 'lastSeenAt', 'userAgent', 'ip'],
        order: [['createdAt', 'ASC']],
    });
    return groupFamilies(rows);
}

// Which of the live families (idlest first) must end so that, with the new
// one, at most `max` remain. Pure, so the rule is unit-tested.
function familiesToEnd(families, max) {
    const keep = Math.max(0, max - 1);
    if (families.length <= keep) return [];
    return families.slice(0, families.length - keep);
}

// Create a session (new family) and set the cookie. Returns { row, superseded }:
// `superseded` lists the families the account's session limit ended for this
// sign-in ("newest wins"; empty when no limit applies). `limit` is { max } or null.
async function issueSession(res, { userId, companyId, rememberMe, req, limit = null }) {
    const now = new Date();
    const familyId = uuidv4();
    let superseded = [];
    if (limit && companyId && Number.isInteger(limit.max) && limit.max >= 1) {
        superseded = familiesToEnd(await liveFamilies(userId, { now }), limit.max);
        if (superseded.length) {
            await RefreshToken.update(
                { revokedAt: now, supersededByFamilyId: familyId },
                { where: { familyId: { [Op.in]: superseded.map((f) => f.familyId) }, revokedAt: null } },
            );
        }
    }

    const raw = crypto.randomBytes(32).toString('hex');
    const ttl = rememberMe ? REMEMBERED_TTL_MS : NORMAL_TTL_MS;
    const row = await RefreshToken.create({
        userId,
        companyId: companyId || null,
        tokenHash: hashRt(raw),
        familyId,
        expiresAt: new Date(now.getTime() + ttl),
        lastSeenAt: now,
        userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 400) : null,
        ip: req ? String(req.ip || '').slice(0, 64) : null,
    });
    res.cookie(COOKIE_NAME, raw, cookieOptions(ttl));
    return { row, superseded };
}

// Rotate the presented cookie value. Returns { row } with the fresh row (the
// new raw is set on the cookie), or { row: null, reason } when the token is
// unknown / expired / revoked - `reason` says whether a newer sign-in ended
// it (SESSION_SUPERSEDED) or it simply ended (SESSION_ENDED).
// Replay of a ROTATED token = theft signal -> the entire family is revoked.
async function rotateSession(req, res) {
    const raw = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!raw) return { row: null, reason: SESSION_ENDED };

    const row = await RefreshToken.findOne({ where: { tokenHash: hashRt(raw) } });
    if (!row) return { row: null, reason: SESSION_ENDED };

    if (row.revokedAt) return { row: null, reason: row.supersededByFamilyId ? SESSION_SUPERSEDED : SESSION_ENDED };
    if (new Date(row.expiresAt).getTime() <= Date.now()) return { row: null, reason: SESSION_ENDED };
    if (row.rotatedAt) {
        // Someone is replaying an already-rotated token: kill the family.
        await RefreshToken.update(
            { revokedAt: new Date() },
            { where: { familyId: row.familyId, revokedAt: null } },
        );
        console.warn(`[SESSION] rotated-token replay for user ${row.userId} - family revoked.`);
        return { row: null, reason: SESSION_ENDED };
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
        lastSeenAt: new Date(),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 400),
        ip: String(req.ip || '').slice(0, 64),
    });
    row.rotatedAt = new Date();
    await row.save();
    res.cookie(COOKIE_NAME, newRaw, cookieOptions(Math.max(remainingMs, 60 * 1000)));
    return { row: fresh };
}

// Is the session behind an access token still live? `sid` is the family id
// carried in the token. Answers { live: true } or { live: false, reason }.
// One indexed read per request (the familyId index); a token without a sid
// (minted before 2026-11-05, or a portal token with no session) is not checked.
async function sessionIsLive(sid) {
    if (!sid) return { live: true };
    const latest = await RefreshToken.findOne({
        where: { familyId: sid },
        attributes: ['revokedAt', 'supersededByFamilyId'],
        order: [['createdAt', 'DESC']],
    });
    if (!latest) return { live: false, reason: SESSION_ENDED };
    if (latest.revokedAt) return { live: false, reason: latest.supersededByFamilyId ? SESSION_SUPERSEDED : SESSION_ENDED };
    return { live: true };
}

// The 401 an ended session gets on its next request. Clear-Site-Data makes
// the browser drop its cache and storage for the app's origin (the SPA is
// served from the same origin through the /api proxy), so nothing of the
// ended session lingers. Cookies are left alone on purpose: the trusted-
// device and registered-workstation cookies are not sessions and survive a
// kick; the refresh cookie is cleared explicitly (its family is dead
// server-side anyway).
const ENDED_MESSAGES = {
    [SESSION_SUPERSEDED]: 'You were signed out because your account signed in on another device.',
    [SESSION_ENDED]: 'Your session has ended. Please sign in again.',
};
function endedSessionResponse(res, reason) {
    const why = ENDED_MESSAGES[reason] ? reason : SESSION_ENDED;
    res.set('Clear-Site-Data', '"cache", "storage"');
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(0), maxAge: undefined });
    return res.status(401).json({ message: ENDED_MESSAGES[why], reason: why });
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

// Revoke ONE of the user's own families (Profile -> Active sessions -> Sign
// out). Never the caller's own session - that is what Sign out is for.
// Returns true when a live row was ended.
async function revokeFamily(userId, familyId, { exceptFamilyId = null } = {}) {
    if (!familyId || familyId === exceptFamilyId) return false;
    const [count] = await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { userId, familyId, revokedAt: null } },
    );
    return count > 0;
}

// Revoke every OTHER session of the user ("sign out everywhere else").
// Returns the number of families ended.
async function revokeOtherSessions(userId, currentFamilyId) {
    const now = new Date();
    const others = (await liveFamilies(userId, { tenantOnly: false, now })).filter((f) => f.familyId !== currentFamilyId);
    if (!others.length) return 0;
    await RefreshToken.update(
        { revokedAt: now },
        { where: { userId, familyId: { [Op.in]: others.map((f) => f.familyId) }, revokedAt: null } },
    );
    return others.length;
}

// Was this session opened with "Keep me signed in"? Derived from its horizon.
function isRemembered(row) {
    return new Date(row.expiresAt).getTime() - new Date(row.createdAt).getTime() > 2 * DAY_MS;
}

module.exports = {
    SESSION_SUPERSEDED,
    SESSION_ENDED,
    issueSession,
    rotateSession,
    sessionIsLive,
    endedSessionResponse,
    revokeSession,
    revokeAllSessions,
    revokeFamily,
    revokeOtherSessions,
    liveFamilies,
    groupFamilies,
    familiesToEnd,
    isRemembered,
};
