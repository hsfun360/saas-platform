// Unit tests for the addCollaborator SAME-ACCOUNT guard — a Tenant Admin may only
// directly add a person who already belongs to their own subscriber account, and
// the "not addable" response is identical whether the email is unknown or belongs
// to another account (so it can't be used to enumerate platform users).
//
// Runs on Node's built-in test runner (no external deps):  node --test
// Sequelize models are stubbed, so no database connection is made.

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const User = require('../identity/user.model');
const CompanyUser = require('./companyUser.model');
const Company = require('./company.model');
const Account = require('./account.model');
const Role = require('./role.model');
const { sequelize } = require('../../platform/db');
const controller = require('./tenant.controller');

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

function fakeTx() {
    return { finished: false, commit: fn(async () => {}), rollback: fn(async () => {}) };
}

// The admin acts within company-A, which belongs to account acct-X.
const ADMIN_REQ = (body) => ({ user: { id: 'admin-1', companyId: 'company-A', email: 'admin@acme.test' }, body });

let tx;
beforeEach(() => {
    tx = fakeTx();
    sequelize.transaction = fn(async () => tx);
    // resolveAccountId() looks the admin's company up to find its accountId.
    Company.findByPk = fn(async () => ({ id: 'company-A', accountId: 'acct-X' }));
    // admin-1 owns account acct-X, so they administer company-A (account SuperUser).
    Account.findByPk = fn(async () => ({ id: 'acct-X', ownerUserId: 'admin-1' }));
    Role.findOne = fn(async () => ({ id: 'role-1', companyId: 'company-A' }));
    CompanyUser.create = fn(async () => ({}));
    CompanyUser.findOne = fn(async () => null);
});

test('rejects a user from another account with a generic 422 and creates nothing', async () => {
    User.findOne = fn(async () => ({ id: 'u-ext', email: 'consultant@other.test', full_name: 'Ext' }));
    // Their only membership is in company-Y (a different account)...
    CompanyUser.findAll = fn(async () => [{ companyId: 'company-Y' }]);
    // ...so none of their companies fall under acct-X.
    Company.count = fn(async () => 0);

    const res = mockRes();
    await controller.addCollaborator(ADMIN_REQ({ email: 'consultant@other.test' }), res);

    assert.strictEqual(res.statusCode, 422);
    assert.match(res.body.message, /isn't in your account/i);
    assert.strictEqual(CompanyUser.create.calls.length, 0, 'must NOT add an outsider');
    assert.strictEqual(tx.rollback.calls.length, 1);
});

test('an unknown email returns the SAME generic 422 (no existence disclosure)', async () => {
    User.findOne = fn(async () => null);
    CompanyUser.findAll = fn(async () => []);
    Company.count = fn(async () => 0);

    const res = mockRes();
    await controller.addCollaborator(ADMIN_REQ({ email: 'nobody@nowhere.test' }), res);

    assert.strictEqual(res.statusCode, 422, 'unknown email must be indistinguishable from cross-account');
    assert.match(res.body.message, /isn't in your account/i);
    assert.strictEqual(CompanyUser.create.calls.length, 0);
});

test('adds a same-account user as a collaborator with the chosen role', async () => {
    User.findOne = fn(async () => ({ id: 'u-same', email: 'colleague@acme.test', full_name: 'Colleague' }));
    // They already belong to company-B, which is under the SAME account (acct-X).
    CompanyUser.findAll = fn(async () => [{ companyId: 'company-B' }]);
    Company.count = fn(async () => 1);

    const res = mockRes();
    await controller.addCollaborator(ADMIN_REQ({ email: 'colleague@acme.test', roleId: 'role-1' }), res);

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(CompanyUser.create.calls.length, 1);
    const createdWith = CompanyUser.create.calls[0][0];
    assert.deepStrictEqual(
        { userId: createdWith.userId, companyId: createdWith.companyId, roleId: createdWith.roleId, isActive: createdWith.isActive },
        { userId: 'u-same', companyId: 'company-A', roleId: 'role-1', isActive: true },
    );
    assert.strictEqual(tx.commit.calls.length, 1);
});

test('rejects re-adding someone who is already a collaborator on this company (409)', async () => {
    User.findOne = fn(async () => ({ id: 'u-same', email: 'colleague@acme.test', full_name: 'Colleague' }));
    CompanyUser.findAll = fn(async () => [{ companyId: 'company-B' }]);
    Company.count = fn(async () => 1);
    CompanyUser.findOne = fn(async () => ({ id: 'existing-link' })); // already a collaborator

    const res = mockRes();
    await controller.addCollaborator(ADMIN_REQ({ email: 'colleague@acme.test', roleId: 'role-1' }), res);

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(CompanyUser.create.calls.length, 0, 'must not create a duplicate link');
    assert.strictEqual(tx.rollback.calls.length, 1);
});
