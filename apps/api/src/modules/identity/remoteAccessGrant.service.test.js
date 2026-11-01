// Unit tests for the remote-access grant rules (remoteAccessGrant.service):
// when a grant is live, the day ceiling, the request / approve / reject /
// grant-in-advance / revoke paths, and who is rung. The model statics and the
// notification gateway are stubbed; nothing touches a DB.
//
// Runs on Node's built-in test runner (no external deps):  node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const RemoteAccessGrant = require('./remoteAccessGrant.model');
const User = require('./user.model');
const Account = require('../saas/account.model');
const Company = require('../saas/company.model');
const CompanyUser = require('../saas/companyUser.model');
const Role = require('../saas/role.model');
const Menu = require('../saas/menu.model');
const RoleMenu = require('../saas/roleMenu.model');
const gateway = require('../../platform/notificationGateway');
const svc = require('./remoteAccessGrant.service');

const DAY = 24 * 60 * 60 * 1000;

function fn(impl) {
    const f = (...args) => { f.calls.push(args); return impl ? impl(...args) : undefined; };
    f.calls = [];
    return f;
}

function row(over = {}) {
    return {
        id: 'g-1', accountId: 'acct-A', userId: 'u-alice', status: 'pending', reason: 'Clubhouse closed', requestedAt: new Date(Date.now() - DAY),
        requestUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36', requestIp: '203.0.113.9',
        validFrom: null, validUntil: null, decidedByUserId: null, decidedAt: null, decisionNote: null, revokedAt: null,
        save: async function () { this.saved = (this.saved || 0) + 1; },
        ...over,
    };
}

const USERS = {
    'u-alice': { id: 'u-alice', email: 'alice@acme.test', full_name: 'Alice Tan' },
    'u-boss': { id: 'u-boss', email: 'boss@acme.test', full_name: 'Yap Soon Kum' },
    'u-owner': { id: 'u-owner', email: 'owner@acme.test', full_name: '' },
};

beforeEach(() => {
    User.findByPk = fn(async (id) => USERS[id] || null);
    User.findAll = fn(async ({ where }) => {
        const ids = where.id[Object.getOwnPropertySymbols(where.id)[0]];
        return ids.map((id) => USERS[id]).filter(Boolean);
    });
    gateway.notifyUser = fn(async () => ({}));
    gateway.emailAddress = fn(async () => true);
    RemoteAccessGrant.update = fn(async () => [0]);
});

// ---- grantIsLive + normaliseDays: the pure rules ----

test('a grant is live only while approved, unrevoked and inside its window', () => {
    const now = Date.now();
    const live = row({ status: 'approved', validFrom: new Date(now - DAY), validUntil: new Date(now + DAY) });
    assert.strictEqual(svc.grantIsLive(live, now), true);
    assert.strictEqual(svc.grantIsLive({ ...live, status: 'pending' }, now), false);
    assert.strictEqual(svc.grantIsLive({ ...live, revokedAt: new Date() }, now), false);
    assert.strictEqual(svc.grantIsLive({ ...live, validUntil: new Date(now - 1) }, now), false, 'expired');
    assert.strictEqual(svc.grantIsLive({ ...live, validFrom: new Date(now + 1000) }, now), false, 'not yet');
    assert.strictEqual(svc.grantIsLive(null, now), false);
});

test('the window is a whole number of days from 1 to the account ceiling, and the ceiling itself is bounded', () => {
    assert.deepStrictEqual(svc.normaliseDays(7, 30), { days: 7, ceiling: 30 });
    assert.deepStrictEqual(svc.normaliseDays(30, 30), { days: 30, ceiling: 30 });
    assert.match(svc.normaliseDays(31, 30).error, /from 1 to 30/);
    assert.match(svc.normaliseDays(0, 30).error, /from 1 to 30/);
    assert.match(svc.normaliseDays(2.5, 30).error, /from 1 to 30/);
    // A stored ceiling outside 1-90 falls back to the platform default.
    assert.deepStrictEqual(svc.normaliseDays(5, 500), { days: 5, ceiling: 30 });
    assert.deepStrictEqual(svc.normaliseDays(5, undefined), { days: 5, ceiling: 30 });
});

// ---- liveGrantFor: what the login gate asks ----

test('liveGrantFor returns the live grant, and null when none is in force', async () => {
    const now = Date.now();
    const live = row({ status: 'approved', validFrom: new Date(now - DAY), validUntil: new Date(now + DAY) });
    RemoteAccessGrant.findAll = fn(async () => [live]);
    assert.strictEqual(await svc.liveGrantFor('acct-A', 'u-alice'), live);
    const where = RemoteAccessGrant.findAll.calls[0][0].where;
    assert.strictEqual(where.status, 'approved');
    assert.strictEqual(where.revokedAt, null);
    RemoteAccessGrant.findAll = fn(async () => [row({ status: 'approved', validFrom: new Date(now + DAY), validUntil: new Date(now + 2 * DAY) })]);
    assert.strictEqual(await svc.liveGrantFor('acct-A', 'u-alice'), null, 'a future window is not live yet');
    assert.strictEqual(await svc.liveGrantFor(null, 'u-alice'), null);
});

// ---- approverUserIds ----

test('approvers are the owner, Tenant Admins and holders of the Access Requests edit action across the account', async () => {
    Account.findByPk = fn(async () => ({ id: 'acct-A', ownerUserId: 'u-owner' }));
    Role.findAll = fn(async () => [{ id: 'r-admin', name: 'Tenant Admin' }, { id: 'r-mgr', name: 'Manager' }, { id: 'r-fd', name: 'Front Desk' }]);
    Menu.findOne = fn(async () => ({ id: 'menu-ar' }));
    RoleMenu.findAll = fn(async () => [{ roleId: 'r-mgr' }]);
    Company.findAll = fn(async () => [{ id: 'c-1' }, { id: 'c-2' }]);
    CompanyUser.findAll = fn(async ({ where }) => {
        const roleIds = where.roleId[Object.getOwnPropertySymbols(where.roleId)[0]];
        assert.deepStrictEqual([...roleIds].sort(), ['r-admin', 'r-mgr'], 'front desk never approves');
        return [{ userId: 'u-boss' }, { userId: 'u-owner' }, { userId: 'u-boss' }];
    });
    const ids = await svc.approverUserIds('acct-A');
    assert.deepStrictEqual(ids.sort(), ['u-boss', 'u-owner']);
});

test('without the Access Requests menu row, Tenant Admins and the owner still approve', async () => {
    Account.findByPk = fn(async () => ({ id: 'acct-A', ownerUserId: null }));
    Role.findAll = fn(async () => [{ id: 'r-admin', name: 'Tenant Admin' }]);
    Menu.findOne = fn(async () => null);
    RoleMenu.findAll = fn(async () => { throw new Error('must not query grants without a menu'); });
    Company.findAll = fn(async () => [{ id: 'c-1' }]);
    CompanyUser.findAll = fn(async () => [{ userId: 'u-boss' }]);
    assert.deepStrictEqual(await svc.approverUserIds('acct-A'), ['u-boss']);
});

// ---- requestRemoteAccess ----

function stubApprovers(ids) {
    Account.findByPk = fn(async () => ({ id: 'acct-A', ownerUserId: null }));
    Role.findAll = fn(async () => [{ id: 'r-admin', name: 'Tenant Admin' }]);
    Menu.findOne = fn(async () => null);
    Company.findAll = fn(async () => [{ id: 'c-1' }]);
    CompanyUser.findAll = fn(async () => ids.map((userId) => ({ userId })));
}

test('a first request creates a pending row from the request and rings every approver but the requester', async () => {
    stubApprovers(['u-boss', 'u-alice']);
    RemoteAccessGrant.findOne = fn(async () => null);
    const created = [];
    RemoteAccessGrant.create = fn(async (values) => { created.push(values); return row({ id: 'g-new', ...values }); });
    const req = { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' }, ip: '198.51.100.7' };

    const out = await svc.requestRemoteAccess({ accountId: 'acct-A', userId: 'u-alice', reason: '  Working from home  ', req });
    assert.strictEqual(out.refreshed, false);
    assert.strictEqual(created[0].status, 'pending');
    assert.strictEqual(created[0].reason, 'Working from home');
    assert.strictEqual(created[0].requestIp, '198.51.100.7');
    // One bell + one email, to the boss only (the requester is an approver too but is skipped).
    assert.strictEqual(gateway.notifyUser.calls.length, 1);
    assert.strictEqual(gateway.notifyUser.calls[0][0].userId, 'u-boss');
    assert.strictEqual(gateway.notifyUser.calls[0][0].linkRoute, '/admin/access-requests');
    assert.strictEqual(gateway.emailAddress.calls.length, 1);
    const mail = gateway.emailAddress.calls[0][0];
    assert.strictEqual(mail.templateKey, 'access.remote-request');
    assert.strictEqual(mail.to, 'boss@acme.test');
    assert.strictEqual(mail.accountId, 'acct-A');
    assert.strictEqual(mail.data.requesterName, 'Alice Tan');
    assert.strictEqual(mail.data.device, 'Safari on iPhone');
    assert.strictEqual(mail.data.reason, 'Working from home');
});

test('asking again while a request waits refreshes that row instead of adding one, and rings again', async () => {
    stubApprovers(['u-boss']);
    const pending = row();
    RemoteAccessGrant.findOne = fn(async () => pending);
    RemoteAccessGrant.create = fn(async () => { throw new Error('must not create'); });
    const out = await svc.requestRemoteAccess({ accountId: 'acct-A', userId: 'u-alice', reason: 'Still at home', req: { headers: {}, ip: '' } });
    assert.strictEqual(out.refreshed, true);
    assert.strictEqual(pending.reason, 'Still at home');
    assert.strictEqual(pending.saved, 1);
    assert.strictEqual(gateway.notifyUser.calls.length, 1);
});

// ---- approveRequest / rejectRequest ----

test('approve sets the window within the ceiling, cuts the user\'s other live grants, and tells the requester', async () => {
    const pending = row();
    RemoteAccessGrant.findOne = fn(async () => pending);
    const before = Date.now();
    const out = await svc.approveRequest({ accountId: 'acct-A', id: 'g-1', days: 5, note: ' Until Friday ', deciderUserId: 'u-boss', maxDays: 30 });
    assert.ok(!out.error);
    assert.strictEqual(pending.status, 'approved');
    assert.strictEqual(pending.decidedByUserId, 'u-boss');
    assert.strictEqual(pending.decisionNote, 'Until Friday');
    const span = pending.validUntil.getTime() - pending.validFrom.getTime();
    assert.strictEqual(span, 5 * DAY);
    assert.ok(pending.validFrom.getTime() >= before);
    // Other live grants of the same user were revoked first.
    assert.strictEqual(RemoteAccessGrant.update.calls.length, 1);
    assert.deepStrictEqual(RemoteAccessGrant.update.calls[0][0].status, 'revoked');
    assert.strictEqual(RemoteAccessGrant.update.calls[0][1].where.userId, 'u-alice');
    // The requester hears about it, in-app and by email, with the decider named.
    assert.strictEqual(gateway.notifyUser.calls[0][0].userId, 'u-alice');
    assert.strictEqual(gateway.notifyUser.calls[0][0].title, 'Remote access approved');
    const mail = gateway.emailAddress.calls[0][0];
    assert.strictEqual(mail.templateKey, 'access.remote-decision');
    assert.strictEqual(mail.to, 'alice@acme.test');
    assert.strictEqual(mail.data.approved, true);
    assert.strictEqual(mail.data.decidedBy, 'Yap Soon Kum');
});

test('approve refuses a window over the ceiling and a request that is not pending', async () => {
    const pending = row();
    RemoteAccessGrant.findOne = fn(async () => pending);
    const over = await svc.approveRequest({ accountId: 'acct-A', id: 'g-1', days: 8, deciderUserId: 'u-boss', maxDays: 7 });
    assert.strictEqual(over.error, 400);
    assert.match(over.message, /from 1 to 7/);
    assert.strictEqual(pending.status, 'pending');
    RemoteAccessGrant.findOne = fn(async () => row({ status: 'rejected' }));
    assert.strictEqual((await svc.approveRequest({ accountId: 'acct-A', id: 'g-1', days: 1, deciderUserId: 'u-boss', maxDays: 7 })).error, 404);
    assert.strictEqual(gateway.notifyUser.calls.length, 0);
});

test('reject records the decision and note and tells the requester, without any window', async () => {
    const pending = row();
    RemoteAccessGrant.findOne = fn(async () => pending);
    const out = await svc.rejectRequest({ accountId: 'acct-A', id: 'g-1', note: 'Come in on Monday', deciderUserId: 'u-boss' });
    assert.ok(!out.error);
    assert.strictEqual(pending.status, 'rejected');
    assert.strictEqual(pending.validUntil, null);
    assert.strictEqual(pending.decisionNote, 'Come in on Monday');
    assert.strictEqual(gateway.notifyUser.calls[0][0].title, 'Remote access request declined');
    assert.strictEqual(gateway.emailAddress.calls[0][0].data.approved, false);
    assert.strictEqual(gateway.emailAddress.calls[0][0].data.note, 'Come in on Monday');
});

// ---- grantRemoteAccess (admin-initiated) ----

test('a grant in advance writes an approved row for the window, answering a pending request if there is one', async () => {
    RemoteAccessGrant.findOne = fn(async () => null);
    const built = [];
    RemoteAccessGrant.build = fn((values) => { const r = row({ id: 'g-adv', ...values }); built.push(r); return r; });
    const out = await svc.grantRemoteAccess({ accountId: 'acct-A', userId: 'u-alice', days: 3, note: 'Conference week', deciderUserId: 'u-boss', maxDays: 30 });
    assert.ok(!out.error);
    assert.strictEqual(built[0].status, 'approved');
    assert.strictEqual(built[0].reason, 'Conference week');
    assert.strictEqual(built[0].validUntil.getTime() - built[0].validFrom.getTime(), 3 * DAY);
    assert.strictEqual(built[0].saved, 1);
    assert.strictEqual(gateway.emailAddress.calls[0][0].data.approved, true);

    // With a pending request waiting, that row becomes the grant.
    const pending = row();
    RemoteAccessGrant.findOne = fn(async () => pending);
    RemoteAccessGrant.build = fn(() => { throw new Error('must reuse the pending row'); });
    await svc.grantRemoteAccess({ accountId: 'acct-A', userId: 'u-alice', days: 1, deciderUserId: 'u-boss', maxDays: 30 });
    assert.strictEqual(pending.status, 'approved');
    assert.strictEqual(pending.saved, 1);

    assert.strictEqual((await svc.grantRemoteAccess({ accountId: 'acct-A', userId: 'nobody', days: 1, deciderUserId: 'u-boss', maxDays: 30 })).error, 404);
});

// ---- revokeGrant + sweepExpired + listGrants ----

test('revoke cuts an approved grant and refuses anything else', async () => {
    const live = row({ status: 'approved', validFrom: new Date(), validUntil: new Date(Date.now() + DAY) });
    RemoteAccessGrant.findOne = fn(async () => live);
    const out = await svc.revokeGrant({ accountId: 'acct-A', id: 'g-1' });
    assert.strictEqual(out, live);
    assert.strictEqual(live.status, 'revoked');
    assert.ok(live.revokedAt instanceof Date);
    assert.strictEqual(await svc.revokeGrant({ accountId: 'acct-A', id: 'g-1' }), null, 'already revoked');
    RemoteAccessGrant.findOne = fn(async () => row());
    assert.strictEqual(await svc.revokeGrant({ accountId: 'acct-A', id: 'g-1' }), null, 'pending is not a grant');
});

test('the list sweeps expired grants first and presents names, devices and the three groups', async () => {
    RemoteAccessGrant.update = fn(async () => [2]);
    const now = Date.now();
    const pending = row();
    const active = row({ id: 'g-2', status: 'approved', validFrom: new Date(now - DAY), validUntil: new Date(now + DAY), decidedByUserId: 'u-boss', decidedAt: new Date() });
    const gone = row({ id: 'g-3', status: 'expired', validFrom: new Date(now - 3 * DAY), validUntil: new Date(now - DAY), decidedByUserId: 'u-boss' });
    RemoteAccessGrant.findAll = fn(async ({ where }) => {
        if (where.status === 'pending') return [pending];
        if (where.status === 'approved') return [active];
        return [gone];
    });
    const out = await svc.listGrants('acct-A');
    assert.deepStrictEqual(RemoteAccessGrant.update.calls[0][0], { status: 'expired' });
    assert.strictEqual(out.pending.length, 1);
    assert.strictEqual(out.pending[0].userName, 'Alice Tan');
    assert.strictEqual(out.pending[0].device, 'Chrome on Windows');
    assert.strictEqual(out.active[0].decidedBy, 'Yap Soon Kum');
    assert.strictEqual(out.history[0].status, 'expired');
    assert.ok(!('requestUserAgent' in out.pending[0]), 'the raw user agent stays server-side');
});
