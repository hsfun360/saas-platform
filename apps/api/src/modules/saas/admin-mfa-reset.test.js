// Unit tests for the System Admin MFA reset (the platform arm of the MFA
// recovery exception, reached from Subscriber Management -> Manage Admin):
// clears the secret, the recovery codes AND the user's trusted devices, and
// refuses to reset the caller's own account.
//
// Runs on Node's built-in test runner (no external deps):  node --test
// Sequelize models are stubbed, so no database connection is made.

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const User = require('../identity/user.model');
const CompanyUser = require('./companyUser.model');
const trustedDevices = require('../identity/trustedDevice.service');
const controller = require('./admin.controller');

function fn(impl) {
    const f = (...args) => {
        f.calls.push(args);
        return impl ? impl(...args) : undefined;
    };
    f.calls = [];
    return f;
}

function mockRes() {
    const res = { statusCode: undefined, body: undefined };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

function enrolledUser(id) {
    return {
        id,
        mfaEnabled: true,
        mfaSecret: 'enc:secret',
        mfaEnrolledAt: new Date('2026-10-01T00:00:00Z'),
        mfaRecoveryCodes: ['h1', 'h2'],
        save: fn(async () => {}),
    };
}

const ADMIN_REQ = (userId) => ({ user: { id: 'sysadmin-1' }, params: { userId } });

let revokeAll;
beforeEach(() => {
    revokeAll = fn(async () => 2);
    trustedDevices.revokeAllTrust = revokeAll;
});

test('clears the secret, recovery codes and trusted devices of another user', async () => {
    const target = enrolledUser('u-tenant-admin');
    User.findByPk = fn(async () => target);
    const res = mockRes();

    await controller.resetUserMfa(ADMIN_REQ('u-tenant-admin'), res);

    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body.message, /has been reset/);
    assert.strictEqual(target.mfaEnabled, false);
    assert.strictEqual(target.mfaSecret, null);
    assert.strictEqual(target.mfaEnrolledAt, null);
    assert.strictEqual(target.mfaRecoveryCodes, null);
    assert.strictEqual(target.save.calls.length, 1);
    assert.deepStrictEqual(revokeAll.calls, [['u-tenant-admin']]);
});

test('refuses to reset the caller\'s own account and touches nothing', async () => {
    const target = enrolledUser('sysadmin-1');
    User.findByPk = fn(async () => target);
    const res = mockRes();

    await controller.resetUserMfa(ADMIN_REQ('sysadmin-1'), res);

    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body.message, /cannot reset your own/);
    assert.strictEqual(target.mfaEnabled, true);
    assert.strictEqual(target.save.calls.length, 0);
    assert.strictEqual(revokeAll.calls.length, 0);
});

test('answers 404 for an unknown user', async () => {
    User.findByPk = fn(async () => null);
    const res = mockRes();

    await controller.resetUserMfa(ADMIN_REQ('nobody'), res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(revokeAll.calls.length, 0);
});

test('the company users listing carries mfaEnabled so the screen can offer the reset', async () => {
    CompanyUser.findAll = fn(async () => [
        { userId: 'u-1', roleId: 'r-1', Role: { name: 'Tenant Admin' } },
        { userId: 'u-2', roleId: 'r-2', Role: { name: 'Clerk' } },
    ]);
    User.findAll = fn(async () => [
        { id: 'u-1', email: 'admin@acme.test', full_name: 'A', authMethod: 'local', mfaEnabled: true },
        { id: 'u-2', email: 'clerk@acme.test', full_name: 'C', authMethod: 'local', mfaEnabled: false },
    ]);
    const res = mockRes();

    await controller.listCompanyUsers({ params: { companyId: 'company-A' } }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.map(u => [u.id, u.mfaEnabled, u.roleName]), [
        ['u-1', true, 'Tenant Admin'],
        ['u-2', false, 'Clerk'],
    ]);
    // Only the listed attributes are read - the secret never leaves the row.
    assert.deepStrictEqual(User.findAll.calls[0][0].attributes, ['id', 'email', 'full_name', 'authMethod', 'mfaEnabled']);
});
