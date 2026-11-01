// src/modules/identity/remoteAccessGrant.service.js
//
// Remote-access grants (approved 2026-11-01): the time-boxed exception to the
// registered-workstation lock (Role.signInLockedToWorkstations). A locked
// staff member signing in off-station may ASK for access; an approver (anyone
// holding the Access Requests menu action, or a Tenant Admin) approves it for
// a window, rejects it, or grants access in advance. A live grant lifts the
// LOCATION lock only: the password and the two-factor code still apply.
//
// The request path is asynchronous: the requester does not wait at the
// sign-in screen. Approvers are rung in-app and by email; the requester is
// emailed the decision. Grants expire on their own (validUntil) and are
// listed, revocable and bounded by Account.remoteAccessGrantMaxDays.

const { Op } = require('sequelize');
const RemoteAccessGrant = require('./remoteAccessGrant.model');
const User = require('./user.model');
const { describeUserAgent } = require('./trustedDevice.service');

const DAY_MS = 24 * 60 * 60 * 1000;
// The platform ceiling on an account's own ceiling.
const GRANT_DAYS = { min: 1, max: 90, default: 30 };
const NOTE_MAX = 500;
const ACCESS_REQUESTS_ROUTE = '/admin/access-requests';

// Is this row a grant that lets the user in NOW? Pure, so the rule is
// unit-tested without a DB.
function grantIsLive(row, now = Date.now()) {
    if (!row || row.status !== 'approved' || row.revokedAt) return false;
    if (!row.validFrom || !row.validUntil) return false;
    const from = new Date(row.validFrom).getTime();
    const until = new Date(row.validUntil).getTime();
    return from <= now && now < until;
}

// The window an approver asked for, bounded by the account's ceiling. Pure.
function normaliseDays(days, maxDays) {
    const ceiling = Number.isInteger(maxDays) && maxDays >= GRANT_DAYS.min && maxDays <= GRANT_DAYS.max ? maxDays : GRANT_DAYS.default;
    const n = Number(days);
    if (!Number.isInteger(n) || n < GRANT_DAYS.min || n > ceiling) {
        return { error: `Days must be a whole number from ${GRANT_DAYS.min} to ${ceiling}.` };
    }
    return { days: n, ceiling };
}

// What the login gate asks: the user's live grant for the account, or null.
async function liveGrantFor(accountId, userId, now = new Date()) {
    if (!accountId || !userId) return null;
    const rows = await RemoteAccessGrant.findAll({
        where: { accountId, userId, status: 'approved', revokedAt: null, validUntil: { [Op.gt]: now } },
        order: [['validUntil', 'DESC']],
    });
    return rows.find((r) => grantIsLive(r, now.getTime())) || null;
}

async function pendingRequestFor(accountId, userId) {
    if (!accountId || !userId) return null;
    return RemoteAccessGrant.findOne({ where: { accountId, userId, status: 'pending' } });
}

// Who decides: every user of the account's companies whose role is Tenant
// Admin or holds the Access Requests menu with the edit action, plus the
// account owner. Resolved at request time so staff changes are picked up.
async function approverUserIds(accountId) {
    const Account = require('../saas/account.model');
    const Company = require('../saas/company.model');
    const CompanyUser = require('../saas/companyUser.model');
    const Role = require('../saas/role.model');
    const Menu = require('../saas/menu.model');
    const RoleMenu = require('../saas/roleMenu.model');

    const ids = new Set();
    const account = await Account.findByPk(accountId, { attributes: ['id', 'ownerUserId'] });
    if (account && account.ownerUserId) ids.add(account.ownerUserId);

    const roles = await Role.findAll({ where: { accountId }, attributes: ['id', 'name'] });
    const approverRoleIds = new Set(roles.filter((r) => r.name === 'Tenant Admin').map((r) => r.id));
    const menu = await Menu.findOne({ where: { route: ACCESS_REQUESTS_ROUTE }, attributes: ['id'] });
    if (menu && roles.length) {
        const grants = await RoleMenu.findAll({
            where: { menuId: menu.id, roleId: { [Op.in]: roles.map((r) => r.id) }, canEdit: { [Op.ne]: false } },
            attributes: ['roleId'],
        });
        for (const g of grants) approverRoleIds.add(g.roleId);
    }
    if (approverRoleIds.size) {
        const companies = await Company.findAll({ where: { accountId }, attributes: ['id'] });
        if (companies.length) {
            const members = await CompanyUser.findAll({
                where: { companyId: { [Op.in]: companies.map((c) => c.id) }, roleId: { [Op.in]: [...approverRoleIds] }, isActive: true },
                attributes: ['userId'],
            });
            for (const m of members) ids.add(m.userId);
        }
    }
    return [...ids];
}

function frontendBase() {
    return process.env.FRONTEND_BASE_URL || 'http://localhost:4200';
}

// Ring the approvers: a bell row each, and the templated email.
async function notifyApprovers({ accountId, row, requester }) {
    const gateway = require('../../platform/notificationGateway');
    const ids = await approverUserIds(accountId);
    const approvers = ids.length ? await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'email', 'full_name'] }) : [];
    const requesterName = requester.full_name || requester.email;
    const device = describeUserAgent(row.requestUserAgent);
    for (const a of approvers) {
        if (a.id === requester.id) continue;
        await gateway.notifyUser({
            userId: a.id,
            type: 'remote-access-request',
            title: `${requesterName} asks to sign in from outside the premises`,
            body: row.reason ? `Reason: ${row.reason}` : `From ${device}${row.requestIp ? ` (${row.requestIp})` : ''}.`,
            linkRoute: ACCESS_REQUESTS_ROUTE,
        });
        await gateway.emailAddress({
            accountId,
            templateKey: 'access.remote-request',
            to: a.email,
            data: {
                userName: a.full_name || '',
                requesterName,
                requesterEmail: requester.email,
                device,
                ip: row.requestIp || '',
                reason: row.reason || '',
                requestedAt: new Date(row.requestedAt).toISOString(),
                reviewLink: `${frontendBase()}${ACCESS_REQUESTS_ROUTE}`,
            },
        });
    }
    return approvers.length;
}

// Tell the requester what was decided (or granted in advance).
async function notifyRequester({ accountId, row, decider }) {
    const gateway = require('../../platform/notificationGateway');
    const user = await User.findByPk(row.userId, { attributes: ['id', 'email', 'full_name'] });
    if (!user) return false;
    const approved = row.status === 'approved';
    const until = approved && row.validUntil ? new Date(row.validUntil) : null;
    await gateway.notifyUser({
        userId: user.id,
        type: 'remote-access-decision',
        title: approved ? 'Remote access approved' : 'Remote access request declined',
        body: approved
            ? `You may sign in from outside the premises until ${until.toISOString()}.${row.decisionNote ? ` Note: ${row.decisionNote}` : ''}`
            : (row.decisionNote ? `Note: ${row.decisionNote}` : 'Ask your administrator if you need access from elsewhere.'),
        linkRoute: null,
    });
    await gateway.emailAddress({
        accountId,
        templateKey: 'access.remote-decision',
        to: user.email,
        data: {
            userName: user.full_name || '',
            approved,
            validUntil: until ? until.toISOString() : '',
            note: row.decisionNote || '',
            decidedBy: decider ? (decider.full_name || decider.email || '') : '',
            loginLink: `${frontendBase()}/login`,
        },
    });
    return true;
}

// From the sign-in screen: create (or refresh) the user's pending request
// and ring the approvers. One pending request per user per account; asking
// again updates the reason and the device, and rings again.
async function requestRemoteAccess({ accountId, userId, reason, req }) {
    const user = await User.findByPk(userId, { attributes: ['id', 'email', 'full_name'] });
    if (!user) return { error: 404, message: 'User not found.' };
    const text = String(reason || '').trim().slice(0, NOTE_MAX) || null;
    const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 400);
    const ip = String((req && req.ip) || '').slice(0, 64);

    let row = await pendingRequestFor(accountId, userId);
    const refreshed = !!row;
    if (row) {
        row.reason = text;
        row.requestedAt = new Date();
        row.requestUserAgent = ua;
        row.requestIp = ip;
        await row.save();
    } else {
        row = await RemoteAccessGrant.create({
            accountId, userId, status: 'pending', reason: text, requestedAt: new Date(), requestUserAgent: ua, requestIp: ip,
        });
    }
    const approvers = await notifyApprovers({ accountId, row, requester: user });
    return { row, refreshed, approvers };
}

// Approve a pending request for `days` (bounded by the account's ceiling).
// Any other live grant of the same user is cut, so one window is in force.
async function approveRequest({ accountId, id, days, note, deciderUserId, maxDays }) {
    const row = await RemoteAccessGrant.findOne({ where: { id, accountId } });
    if (!row || row.status !== 'pending') return { error: 404, message: 'That request is no longer waiting for a decision.' };
    const window = normaliseDays(days, maxDays);
    if (window.error) return { error: 400, message: window.error };
    const now = new Date();
    await RemoteAccessGrant.update(
        { status: 'revoked', revokedAt: now },
        { where: { accountId, userId: row.userId, status: 'approved', revokedAt: null, validUntil: { [Op.gt]: now } } },
    );
    row.status = 'approved';
    row.validFrom = now;
    row.validUntil = new Date(now.getTime() + window.days * DAY_MS);
    row.decidedByUserId = deciderUserId;
    row.decidedAt = now;
    row.decisionNote = String(note || '').trim().slice(0, NOTE_MAX) || null;
    await row.save();
    const decider = await User.findByPk(deciderUserId, { attributes: ['id', 'email', 'full_name'] });
    await notifyRequester({ accountId, row, decider });
    return { row };
}

async function rejectRequest({ accountId, id, note, deciderUserId }) {
    const row = await RemoteAccessGrant.findOne({ where: { id, accountId } });
    if (!row || row.status !== 'pending') return { error: 404, message: 'That request is no longer waiting for a decision.' };
    row.status = 'rejected';
    row.decidedByUserId = deciderUserId;
    row.decidedAt = new Date();
    row.decisionNote = String(note || '').trim().slice(0, NOTE_MAX) || null;
    await row.save();
    const decider = await User.findByPk(deciderUserId, { attributes: ['id', 'email', 'full_name'] });
    await notifyRequester({ accountId, row, decider });
    return { row };
}

// Admin-initiated: grant without a request (the manager knows in advance).
// Writes the same row shape, so one list shows both paths. A pending request
// of that user is answered by it.
async function grantRemoteAccess({ accountId, userId, days, note, deciderUserId, maxDays }) {
    const user = await User.findByPk(userId, { attributes: ['id', 'email', 'full_name'] });
    if (!user) return { error: 404, message: 'User not found.' };
    const window = normaliseDays(days, maxDays);
    if (window.error) return { error: 400, message: window.error };
    const now = new Date();
    const text = String(note || '').trim().slice(0, NOTE_MAX) || null;
    await RemoteAccessGrant.update(
        { status: 'revoked', revokedAt: now },
        { where: { accountId, userId, status: 'approved', revokedAt: null, validUntil: { [Op.gt]: now } } },
    );
    let row = await pendingRequestFor(accountId, userId);
    if (row) {
        row.status = 'approved';
    } else {
        row = RemoteAccessGrant.build({ accountId, userId, status: 'approved', reason: text, requestedAt: now });
    }
    row.validFrom = now;
    row.validUntil = new Date(now.getTime() + window.days * DAY_MS);
    row.decidedByUserId = deciderUserId;
    row.decidedAt = now;
    row.decisionNote = text;
    await row.save();
    const decider = await User.findByPk(deciderUserId, { attributes: ['id', 'email', 'full_name'] });
    await notifyRequester({ accountId, row, decider });
    return { row };
}

// Cut an approved grant short. Returns the row or null.
async function revokeGrant({ accountId, id }) {
    const row = await RemoteAccessGrant.findOne({ where: { id, accountId } });
    if (!row || row.status !== 'approved' || row.revokedAt) return null;
    row.status = 'revoked';
    row.revokedAt = new Date();
    await row.save();
    return row;
}

// Stamp approved rows past their window as expired. A static update by
// design: it is bookkeeping, not a decision. Returns the count.
async function sweepExpired(accountId, now = new Date()) {
    const [count] = await RemoteAccessGrant.update(
        { status: 'expired' },
        { where: { accountId, status: 'approved', revokedAt: null, validUntil: { [Op.lte]: now } } },
    );
    return count || 0;
}

function presentGrant(row, userById) {
    const u = userById.get(row.userId);
    const d = row.decidedByUserId ? userById.get(row.decidedByUserId) : null;
    return {
        id: row.id,
        userId: row.userId,
        userName: u ? (u.full_name || u.email) : null,
        userEmail: u ? u.email : null,
        status: row.status,
        reason: row.reason || null,
        requestedAt: row.requestedAt,
        device: row.requestUserAgent ? describeUserAgent(row.requestUserAgent) : null,
        ip: row.requestIp || null,
        validFrom: row.validFrom || null,
        validUntil: row.validUntil || null,
        decidedBy: d ? (d.full_name || d.email) : null,
        decidedAt: row.decidedAt || null,
        decisionNote: row.decisionNote || null,
        revokedAt: row.revokedAt || null,
    };
}

// What the Access Requests screen shows: pending requests (oldest first),
// live grants (soonest to expire first) and recent history.
async function listGrants(accountId, { historyLimit = 50 } = {}) {
    await sweepExpired(accountId);
    const [pending, active, history] = await Promise.all([
        RemoteAccessGrant.findAll({ where: { accountId, status: 'pending' }, order: [['requestedAt', 'ASC']] }),
        RemoteAccessGrant.findAll({ where: { accountId, status: 'approved', revokedAt: null }, order: [['validUntil', 'ASC']] }),
        RemoteAccessGrant.findAll({
            where: { accountId, status: { [Op.in]: ['rejected', 'revoked', 'expired'] } },
            order: [['updatedAt', 'DESC']],
            limit: historyLimit,
        }),
    ]);
    const all = [...pending, ...active, ...history];
    const ids = new Set();
    for (const r of all) { ids.add(r.userId); if (r.decidedByUserId) ids.add(r.decidedByUserId); }
    const users = ids.size ? await User.findAll({ where: { id: { [Op.in]: [...ids] } }, attributes: ['id', 'email', 'full_name'] }) : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    return {
        pending: pending.map((r) => presentGrant(r, userById)),
        active: active.map((r) => presentGrant(r, userById)),
        history: history.map((r) => presentGrant(r, userById)),
    };
}

async function countActiveGrants(accountId, now = new Date()) {
    if (!accountId) return 0;
    return RemoteAccessGrant.count({ where: { accountId, status: 'approved', revokedAt: null, validFrom: { [Op.lte]: now }, validUntil: { [Op.gt]: now } } });
}

async function countPendingRequests(accountId) {
    if (!accountId) return 0;
    return RemoteAccessGrant.count({ where: { accountId, status: 'pending' } });
}

module.exports = {
    GRANT_DAYS,
    NOTE_MAX,
    ACCESS_REQUESTS_ROUTE,
    grantIsLive,
    normaliseDays,
    liveGrantFor,
    pendingRequestFor,
    approverUserIds,
    requestRemoteAccess,
    approveRequest,
    rejectRequest,
    grantRemoteAccess,
    revokeGrant,
    sweepExpired,
    listGrants,
    countActiveGrants,
    countPendingRequests,
};
