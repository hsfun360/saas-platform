// Unit tests for the requireMenuAction RBAC middleware (role -> menu -> action).
// Models are stubbed; no database connection is made.
//
//   node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test } = require('node:test');
const assert = require('node:assert');

const CompanyUser = require('../modules/saas/companyUser.model');
const Role = require('../modules/saas/role.model');
const Menu = require('../modules/saas/menu.model');
const RoleMenu = require('../modules/saas/roleMenu.model');
const { requireMenuAction } = require('./serviceContext');

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

function mockReq(method, user) {
    return { method, user };
}

const USER = { id: 'user-1', companyId: 'co-1', isSystemAdmin: false };

// Baseline stubs: a normal role holding a grant to the menu; individual tests
// override the piece they exercise.
function stubHappyPath(grant) {
    CompanyUser.findOne = fn(async () => ({ roleId: 'role-1' }));
    Role.findByPk = fn(async () => ({ id: 'role-1', name: 'Front Desk' }));
    Menu.findOne = fn(async () => ({ id: 'menu-1', name: 'Membership Fee' }));
    RoleMenu.findOne = fn(async () => grant);
}

test('requireMenuAction: system admin bypasses without any lookup', async () => {
    CompanyUser.findOne = fn(async () => { throw new Error('must not be called'); });
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('DELETE', { ...USER, isSystemAdmin: true }), res, next);
    assert.strictEqual(next.calls.length, 1);
    assert.strictEqual(CompanyUser.findOne.calls.length, 0);
});

test('requireMenuAction: no role in the workspace -> 403', async () => {
    CompanyUser.findOne = fn(async () => null);
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('GET', USER), res, next);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(next.calls.length, 0);
});

test('requireMenuAction: Tenant Admin role has implicit full access', async () => {
    CompanyUser.findOne = fn(async () => ({ roleId: 'role-ta' }));
    Role.findByPk = fn(async () => ({ id: 'role-ta', name: 'Tenant Admin' }));
    Menu.findOne = fn(async () => { throw new Error('must not be called'); });
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('DELETE', USER), res, next);
    assert.strictEqual(next.calls.length, 1);
});

test('requireMenuAction: unregistered menu route enforces nothing', async () => {
    stubHappyPath(null);
    Menu.findOne = fn(async () => null);
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/not/in/catalogue')(mockReq('DELETE', USER), res, next);
    assert.strictEqual(next.calls.length, 1);
});

test('requireMenuAction: no grant to the menu -> 403 even for GET', async () => {
    stubHappyPath(null);
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('GET', USER), res, next);
    assert.strictEqual(res.statusCode, 403);
    assert.match(res.body.message, /no access/i);
});

test('requireMenuAction: grant allows view (GET) regardless of flags', async () => {
    stubHappyPath({ canCreate: false, canEdit: false, canDelete: false });
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('GET', USER), res, next);
    assert.strictEqual(next.calls.length, 1);
});

test('requireMenuAction: POST needs canCreate', async () => {
    stubHappyPath({ canCreate: false, canEdit: true, canDelete: true });
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('POST', USER), res, next);
    assert.strictEqual(res.statusCode, 403);
    assert.match(res.body.message, /create/i);
});

test('requireMenuAction: PATCH needs canEdit', async () => {
    stubHappyPath({ canCreate: true, canEdit: false, canDelete: true });
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('PATCH', USER), res, next);
    assert.strictEqual(res.statusCode, 403);
    assert.match(res.body.message, /edit/i);
});

test('requireMenuAction: DELETE allowed when canDelete', async () => {
    stubHappyPath({ canCreate: false, canEdit: false, canDelete: true });
    const next = fn();
    const res = mockRes();
    await requireMenuAction('/membership/fees')(mockReq('DELETE', USER), res, next);
    assert.strictEqual(next.calls.length, 1);
});
