// src/modules/identity/registeredWorkstation.service.js
//
// Registered workstations (approved 2026-11-01): trust the PLACE, not the
// person. A Tenant Admin sits at a shared front-desk browser once and
// registers it; the browser gets an httpOnly 'ws' cookie whose SHA-256 is
// stored in RegisteredWorkstation under the ORGANISATION. From then on any
// staff member of that organisation signing in from that browser skips the
// two-factor code - the password/SSO step still runs, enrolment is still
// enforced, and administrator roles confirm a code everywhere regardless.
//
// Why a separate mechanism from TrustedDevice: "don't ask again on this
// device" means "this browser is mine" and is bound to one user, so on a
// shared station every account would need its own trust and anyone who learnt
// a colleague's password could sign in as them. A station is nobody's; it is
// the organisation's second factor because it stands behind the counter and
// can be revoked from Security Policy at any time.
//
// The account decides whether stations count at all
// (Account.workstationTrustEnabled, read through saas/securityPolicy.service);
// the login gate passes that in, so switching it off bites at the next
// sign-in without touching the rows.

const crypto = require('crypto');
const { Op } = require('sequelize');
const RegisteredWorkstation = require('./registeredWorkstation.model');
const User = require('./user.model');
const { describeUserAgent } = require('./trustedDevice.service');

const COOKIE_NAME = 'ws';
// Same scoping as the refresh and trusted-device cookies: only the auth
// gateway ever sees it.
const COOKIE_PATH = '/api/auth';

const DAY_MS = 24 * 60 * 60 * 1000;
// A station is registered for a year; an administrator re-registers to renew.
const WORKSTATION_TTL_DAYS = 365;
const NAME_MAX = 100;

const hashWs = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

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

function presentedToken(req) {
    return req && req.cookies ? req.cookies[COOKIE_NAME] || null : null;
}

function clearWorkstationCookie(res) {
    if (!res || typeof res.clearCookie !== 'function') return;
    const { maxAge, ...scope } = cookieOptions(0);
    res.clearCookie(COOKIE_NAME, scope);
}

// Is this row a live registration for the account? Pure, so the rule is
// unit-tested without a DB.
function workstationIsLive(row, { accountId, now = Date.now() } = {}) {
    if (!row) return false;
    if (accountId && row.accountId !== accountId) return false;
    if (row.revokedAt) return false;
    if (new Date(row.expiresAt).getTime() <= now) return false;
    return true;
}

// The login-gate decision: does a registered workstation stand in for the
// code for THIS sign-in? Only when the account switched stations on, the
// browser presents a live station of that account, and the role is a staff
// role - administrators hold the keys and confirm a code everywhere.
function workstationSkipsCode({ enabled, station, isSystemAdmin, roleName }) {
    if (!enabled || !station) return false;
    if (isSystemAdmin || roleName === 'Tenant Admin') return false;
    return true;
}

// The live station this request presents for the account, or null. Does not
// stamp anything; the gate calls touchWorkstation when it relies on it.
async function presentedWorkstation(req, accountId) {
    const raw = presentedToken(req);
    if (!raw || !accountId) return null;
    const row = await RegisteredWorkstation.findOne({ where: { tokenHash: hashWs(raw) } });
    return workstationIsLive(row, { accountId }) ? row : null;
}

// Stamp lastUsedAt without the audit hooks: a static update by design (one
// sign-in = one churn row otherwise). Never extends expiry.
async function touchWorkstation(row) {
    await RegisteredWorkstation.update({ lastUsedAt: new Date() }, { where: { id: row.id } });
}

// Register the presenting browser as a station of the account: row + cookie.
// A browser that already holds a live station of this account is re-registered
// (the old row is revoked), so "Register this workstation" also renews.
// Returns { row } or { error, message }.
async function registerWorkstation(res, { accountId, userId, name, req }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { error: 400, message: 'Give the workstation a name, for example "Front Desk 1".' };
    if (trimmed.length > NAME_MAX) return { error: 400, message: `The workstation name must be ${NAME_MAX} characters or fewer.` };

    const current = await presentedWorkstation(req, accountId);
    const clash = await RegisteredWorkstation.findOne({
        where: { accountId, name: trimmed, revokedAt: null, ...(current ? { id: { [Op.ne]: current.id } } : {}) },
    });
    if (clash && workstationIsLive(clash, { accountId })) {
        return { error: 409, message: `A workstation named "${trimmed}" is already registered. Revoke it first or pick another name.` };
    }
    if (current) {
        current.revokedAt = new Date();
        await current.save();
    }

    const ttlMs = WORKSTATION_TTL_DAYS * DAY_MS;
    const raw = crypto.randomBytes(32).toString('hex');
    const row = await RegisteredWorkstation.create({
        accountId,
        name: trimmed,
        tokenHash: hashWs(raw),
        registeredByUserId: userId,
        expiresAt: new Date(Date.now() + ttlMs),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 400),
        ip: String(req.ip || '').slice(0, 64),
    });
    res.cookie(COOKIE_NAME, raw, cookieOptions(ttlMs));
    return { row, replaced: !!current };
}

function presentWorkstation(row, currentHash, registeredBy) {
    const who = registeredBy.get(row.registeredByUserId);
    return {
        id: row.id,
        name: row.name,
        device: describeUserAgent(row.userAgent),
        registeredBy: who ? (who.full_name || who.email || null) : null,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        lastUsedAt: row.lastUsedAt || null,
        ip: row.ip || null,
        current: !!currentHash && row.tokenHash === currentHash,
    };
}

// The account's live stations (not revoked, not expired), newest first, with
// `current` marking the browser making the request.
async function listWorkstations(accountId, req) {
    const rows = await RegisteredWorkstation.findAll({
        where: { accountId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
        order: [['createdAt', 'DESC']],
    });
    const registeredBy = new Map();
    const ids = [...new Set(rows.map((r) => r.registeredByUserId).filter(Boolean))];
    if (ids.length) {
        const users = await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'full_name', 'email'] });
        for (const u of users) registeredBy.set(u.id, u);
    }
    const raw = presentedToken(req);
    const currentHash = raw ? hashWs(raw) : null;
    return rows.map((row) => presentWorkstation(row, currentHash, registeredBy));
}

// How many stations the login gate would honour today.
async function countLiveWorkstations(accountId) {
    if (!accountId) return 0;
    return RegisteredWorkstation.count({
        where: { accountId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
    });
}

// Revoke ONE station of the account. Returns the row or null when it is not
// the account's or already revoked. Clears the cookie when the station being
// revoked is the browser making the request.
async function revokeWorkstation(accountId, id, { req, res } = {}) {
    const row = await RegisteredWorkstation.findOne({ where: { id, accountId } });
    if (!row || row.revokedAt) return null;
    row.revokedAt = new Date();
    await row.save();
    const raw = presentedToken(req);
    if (raw && hashWs(raw) === row.tokenHash) clearWorkstationCookie(res);
    return row;
}

module.exports = {
    WORKSTATION_TTL_DAYS,
    NAME_MAX,
    workstationIsLive,
    workstationSkipsCode,
    presentedWorkstation,
    touchWorkstation,
    registerWorkstation,
    listWorkstations,
    countLiveWorkstations,
    revokeWorkstation,
};
