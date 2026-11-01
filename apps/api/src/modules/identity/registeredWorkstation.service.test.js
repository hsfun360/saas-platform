// Unit tests for the registered-workstation rules (registeredWorkstation.service):
// when a station row is live for an account, when a station stands in for the
// two-factor code at sign-in, and the register / list / revoke paths with the
// cookie. The model statics are stubbed; nothing touches a DB.
//
// Runs on Node's built-in test runner (no external deps):  node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const RegisteredWorkstation = require('./registeredWorkstation.model');
const User = require('./user.model');
const svc = require('./registeredWorkstation.service');

const DAY = 24 * 60 * 60 * 1000;
const sha = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function fn(impl) {
    const f = (...args) => { f.calls.push(args); return impl ? impl(...args) : undefined; };
    f.calls = [];
    return f;
}

function fakeRes() {
    const res = { cookies: [], cleared: [] };
    res.cookie = (name, value, opts) => res.cookies.push({ name, value, opts });
    res.clearCookie = (name, opts) => res.cleared.push({ name, opts });
    return res;
}

function reqWith(raw, extra = {}) {
    return { cookies: raw ? { ws: raw } : {}, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36' }, ip: '203.0.113.9', ...extra };
}

function liveRow(over = {}) {
    return {
        id: 'ws-1', accountId: 'acct-A', name: 'Front Desk 1', tokenHash: sha('raw-1'), registeredByUserId: 'admin-1',
        expiresAt: new Date(Date.now() + 300 * DAY), revokedAt: null, lastUsedAt: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36', ip: '203.0.113.9',
        createdAt: new Date(Date.now() - 10 * DAY),
        save: async function () { this.saved = (this.saved || 0) + 1; },
        ...over,
    };
}

// ---- workstationIsLive: the pure rule ----

test('a station is live only for its own account, unrevoked and unexpired', () => {
    const row = liveRow();
    assert.strictEqual(svc.workstationIsLive(row, { accountId: 'acct-A' }), true);
    assert.strictEqual(svc.workstationIsLive(row, { accountId: 'acct-B' }), false, 'another organisation');
    assert.strictEqual(svc.workstationIsLive(liveRow({ revokedAt: new Date() }), { accountId: 'acct-A' }), false, 'revoked');
    assert.strictEqual(svc.workstationIsLive(liveRow({ expiresAt: new Date(Date.now() - 1) }), { accountId: 'acct-A' }), false, 'expired');
    assert.strictEqual(svc.workstationIsLive(null, { accountId: 'acct-A' }), false);
});

// ---- workstationSkipsCode: the login-gate decision ----

test('a station skips the code for staff roles only, and only when the account switched stations on', () => {
    const station = liveRow();
    assert.strictEqual(svc.workstationSkipsCode({ enabled: true, station, isSystemAdmin: false, roleName: 'Front Desk' }), true);
    assert.strictEqual(svc.workstationSkipsCode({ enabled: true, station, isSystemAdmin: false, roleName: 'User' }), true);
    // Administrators hold the keys: a code everywhere.
    assert.strictEqual(svc.workstationSkipsCode({ enabled: true, station, isSystemAdmin: false, roleName: 'Tenant Admin' }), false);
    assert.strictEqual(svc.workstationSkipsCode({ enabled: true, station, isSystemAdmin: true, roleName: 'System Admin' }), false);
    // The switch off, or no station presented: the normal challenge.
    assert.strictEqual(svc.workstationSkipsCode({ enabled: false, station, isSystemAdmin: false, roleName: 'Front Desk' }), false);
    assert.strictEqual(svc.workstationSkipsCode({ enabled: true, station: null, isSystemAdmin: false, roleName: 'Front Desk' }), false);
});

// ---- workstationLockApplies: the per-role lock ----

test('a locked role binds staff only; administrators are never locked, and an unlocked role never is', () => {
    assert.strictEqual(svc.workstationLockApplies({ roleLocked: true, isSystemAdmin: false, roleName: 'Front Desk' }), true);
    assert.strictEqual(svc.workstationLockApplies({ roleLocked: true, isSystemAdmin: false, roleName: 'Tenant Admin' }), false);
    assert.strictEqual(svc.workstationLockApplies({ roleLocked: true, isSystemAdmin: true, roleName: 'System Admin' }), false);
    assert.strictEqual(svc.workstationLockApplies({ roleLocked: false, isSystemAdmin: false, roleName: 'Front Desk' }), false);
    assert.strictEqual(svc.workstationLockApplies({ roleLocked: undefined, isSystemAdmin: false, roleName: 'Front Desk' }), false);
});

// ---- presentedWorkstation + touchWorkstation ----

test('presentedWorkstation finds the live row by the cookie hash and never for another account; touch is a static update', async () => {
    const row = liveRow();
    RegisteredWorkstation.findOne = fn(async ({ where }) => (where.tokenHash === row.tokenHash ? row : null));
    assert.strictEqual(await svc.presentedWorkstation(reqWith('raw-1'), 'acct-A'), row);
    assert.strictEqual(await svc.presentedWorkstation(reqWith('raw-1'), 'acct-B'), null);
    assert.strictEqual(await svc.presentedWorkstation(reqWith('other'), 'acct-A'), null);
    assert.strictEqual(await svc.presentedWorkstation(reqWith(null), 'acct-A'), null);
    assert.strictEqual(await svc.presentedWorkstation(reqWith('raw-1'), null), null);

    RegisteredWorkstation.update = fn(async () => [1]);
    await svc.touchWorkstation(row);
    assert.strictEqual(RegisteredWorkstation.update.calls.length, 1);
    assert.deepStrictEqual(RegisteredWorkstation.update.calls[0][1], { where: { id: 'ws-1' } });
    assert.ok(RegisteredWorkstation.update.calls[0][0].lastUsedAt instanceof Date);
});

// ---- registerWorkstation ----

test('register refuses a blank or over-long name and a name already live in the account', async () => {
    const res = fakeRes();
    RegisteredWorkstation.findOne = fn(async ({ where }) => (where.name === 'Front Desk 1' ? liveRow() : null));
    RegisteredWorkstation.create = fn(async () => { throw new Error('must not create'); });
    assert.deepStrictEqual(await svc.registerWorkstation(res, { accountId: 'acct-A', userId: 'admin-1', name: '   ', req: reqWith(null) }),
        { error: 400, message: 'Give the workstation a name, for example "Front Desk 1".' });
    assert.strictEqual((await svc.registerWorkstation(res, { accountId: 'acct-A', userId: 'admin-1', name: 'x'.repeat(101), req: reqWith(null) })).error, 400);
    const clash = await svc.registerWorkstation(res, { accountId: 'acct-A', userId: 'admin-1', name: ' Front Desk 1 ', req: reqWith(null) });
    assert.strictEqual(clash.error, 409);
    assert.match(clash.message, /already registered/);
    assert.strictEqual(res.cookies.length, 0);
});

test('register creates the row from the request, sets the year-long httpOnly ws cookie, and re-registers a browser that already holds a station', async () => {
    const res = fakeRes();
    const created = [];
    RegisteredWorkstation.findOne = fn(async () => null);
    RegisteredWorkstation.create = fn(async (values) => { created.push(values); return { id: 'ws-new', ...values }; });

    const out = await svc.registerWorkstation(res, { accountId: 'acct-A', userId: 'admin-1', name: 'Front Desk 2', req: reqWith(null) });
    assert.strictEqual(out.replaced, false);
    assert.strictEqual(out.row.id, 'ws-new');
    assert.strictEqual(created[0].accountId, 'acct-A');
    assert.strictEqual(created[0].name, 'Front Desk 2');
    assert.strictEqual(created[0].registeredByUserId, 'admin-1');
    assert.strictEqual(created[0].ip, '203.0.113.9');
    const ttl = created[0].expiresAt.getTime() - Date.now();
    assert.ok(ttl > 364.9 * DAY && ttl <= 365 * DAY, `ttl ~365 days, got ${ttl / DAY}`);
    assert.strictEqual(res.cookies.length, 1);
    const c = res.cookies[0];
    assert.strictEqual(c.name, 'ws');
    assert.strictEqual(sha(c.value), created[0].tokenHash, 'the row stores the hash of the raw cookie');
    assert.strictEqual(c.opts.httpOnly, true);
    assert.strictEqual(c.opts.secure, true);
    assert.strictEqual(c.opts.path, '/api/auth');
    assert.strictEqual(c.opts.maxAge, 365 * DAY);

    // The same browser registering again: its old station is revoked, not duplicated.
    const old = liveRow({ id: 'ws-old', tokenHash: sha('raw-old') });
    RegisteredWorkstation.findOne = fn(async ({ where }) => (where.tokenHash === old.tokenHash ? old : null));
    const again = await svc.registerWorkstation(res, { accountId: 'acct-A', userId: 'admin-1', name: 'Front Desk 3', req: reqWith('raw-old') });
    assert.strictEqual(again.replaced, true);
    assert.ok(old.revokedAt instanceof Date);
    assert.strictEqual(old.saved, 1);
    // The name check excluded the station being replaced.
    const nameCheck = RegisteredWorkstation.findOne.calls.find((c) => c[0].where.name === 'Front Desk 3');
    assert.ok(nameCheck && nameCheck[0].where.id, 'the clash query excludes the current station');
});

// ---- listWorkstations ----

test('list presents the live stations with a device label, who registered them and which one is this browser', async () => {
    const a = liveRow({ id: 'ws-a', name: 'Front Desk 1', tokenHash: sha('raw-a') });
    const b = liveRow({ id: 'ws-b', name: 'Pro Shop', tokenHash: sha('raw-b'), registeredByUserId: 'admin-2', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1', lastUsedAt: new Date() });
    RegisteredWorkstation.findAll = fn(async () => [b, a]);
    User.findAll = fn(async () => [{ id: 'admin-1', full_name: 'Yap Soon Kum', email: 'yap@acme.test' }, { id: 'admin-2', full_name: '', email: 'ops@acme.test' }]);

    const out = await svc.listWorkstations('acct-A', reqWith('raw-a'));
    assert.deepStrictEqual(out.map((w) => [w.id, w.name, w.device, w.registeredBy, w.current]), [
        ['ws-b', 'Pro Shop', 'Safari on iPad', 'ops@acme.test', false],
        ['ws-a', 'Front Desk 1', 'Chrome on Windows', 'Yap Soon Kum', true],
    ]);
    assert.ok(!('tokenHash' in out[0]), 'the hash never leaves the server');
    const where = RegisteredWorkstation.findAll.calls[0][0].where;
    assert.strictEqual(where.accountId, 'acct-A');
    assert.strictEqual(where.revokedAt, null);
});

// ---- revokeWorkstation ----

test('revoke marks the account\'s own station, clears the cookie only when it is this browser, and refuses foreign or dead rows', async () => {
    const row = liveRow();
    RegisteredWorkstation.findOne = fn(async ({ where }) => (where.id === 'ws-1' && where.accountId === 'acct-A' ? row : null));

    let res = fakeRes();
    assert.strictEqual(await svc.revokeWorkstation('acct-B', 'ws-1', { req: reqWith('raw-1'), res }), null, 'another organisation');
    assert.strictEqual(res.cleared.length, 0);

    res = fakeRes();
    const other = await svc.revokeWorkstation('acct-A', 'ws-1', { req: reqWith('raw-other'), res });
    assert.strictEqual(other, row);
    assert.ok(row.revokedAt instanceof Date);
    assert.strictEqual(res.cleared.length, 0, 'a different browser keeps its own cookie');

    res = fakeRes();
    assert.strictEqual(await svc.revokeWorkstation('acct-A', 'ws-1', { req: reqWith('raw-1'), res }), null, 'already revoked');

    const mine = liveRow({ id: 'ws-1' });
    RegisteredWorkstation.findOne = fn(async () => mine);
    res = fakeRes();
    await svc.revokeWorkstation('acct-A', 'ws-1', { req: reqWith('raw-1'), res });
    assert.strictEqual(res.cleared.length, 1);
    assert.strictEqual(res.cleared[0].name, 'ws');
    assert.strictEqual(res.cleared[0].opts.path, '/api/auth');
});
