// Unit tests for tenant role administration - updateTenantRole and deleteTenantRole.
// Covers: the system-managed "Tenant Admin" role is read-only, permission edits
// diff to the minimal add/remove, and a role still assigned to users can't be
// deleted. Models are stubbed; no database connection is made.
//
//   node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const CompanyUser = require('./companyUser.model');
const Company = require('./company.model');
const Account = require('./account.model');
const Role = require('./role.model');
const Menu = require('./menu.model');
const RoleMenu = require('./roleMenu.model');
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

// admin-1 owns account acct-X, which owns company-A - so they administer it.
const REQ = (extra) => ({ user: { id: 'admin-1', companyId: 'company-A', email: 'admin@acme.test' }, ...extra });

let tx;
beforeEach(() => {
    tx = fakeTx();
    sequelize.transaction = fn(async () => tx);
    // hasTenantAdminRole: no explicit Tenant Admin CompanyUser row, but admin-1
    // owns the account that owns the company (account SuperUser path).
    CompanyUser.findOne = fn(async () => null);
    Company.findByPk = fn(async () => ({ id: 'company-A', accountId: 'acct-X' }));
    Account.findByPk = fn(async () => ({ id: 'acct-X', ownerUserId: 'admin-1' }));
});

test('updateTenantRole refuses to edit the system-managed Tenant Admin role (400)', async () => {
    Role.findOne = fn(async () => ({ id: 'role-admin', companyId: 'company-A', name: 'Tenant Admin' }));
    RoleMenu.destroy = fn(async () => {});

    const res = mockRes();
    await controller.updateTenantRole(
        REQ({ params: { roleId: 'role-admin' }, body: { menuIds: ['m1'] } }),
        res,
    );

    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body.message, /system/i);
    assert.strictEqual(RoleMenu.destroy.calls.length, 0, 'must not touch permissions');
    assert.strictEqual(tx.rollback.calls.length, 1);
});

test('updateTenantRole diffs permissions: adds the new menu and removes the dropped one', async () => {
    const updated = fn(async () => {});
    Role.findOne = fn(async () => ({ id: 'role-2', companyId: 'company-A', name: 'Cashier', update: updated }));
    // Two valid menus requested.
    Menu.count = fn(async () => 2);
    // Currently grants m1 + m3; desired is m1 + m2 -> add m2, remove m3.
    RoleMenu.findAll = fn(async () => [{ menuId: 'm1' }, { menuId: 'm3' }]);
    RoleMenu.bulkCreate = fn(async () => {});
    RoleMenu.destroy = fn(async () => {});
    Role.findByPk = fn(async () => ({ id: 'role-2', name: 'Cashier', description: null }));

    const res = mockRes();
    await controller.updateTenantRole(
        REQ({ params: { roleId: 'role-2' }, body: { roleName: 'Cashier', menuIds: ['m1', 'm2'] } }),
        res,
    );

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(RoleMenu.bulkCreate.calls[0][0], [{ roleId: 'role-2', menuId: 'm2' }]);
    assert.deepStrictEqual(RoleMenu.destroy.calls[0][0].where, { roleId: 'role-2', menuId: ['m3'] });
    assert.strictEqual(tx.commit.calls.length, 1);
});

test('updateTenantRole rejects an empty permission set (400)', async () => {
    Role.findOne = fn(async () => ({ id: 'role-2', companyId: 'company-A', name: 'Cashier' }));

    const res = mockRes();
    await controller.updateTenantRole(
        REQ({ params: { roleId: 'role-2' }, body: { menuIds: [] } }),
        res,
    );

    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body.message, /at least one menu/i);
    assert.strictEqual(tx.rollback.calls.length, 1);
});

// ---- The registered-workstation lock on account roles (2026-11-01) ----

test('createAccountRole stores the workstation lock when sent, defaults it off, and refuses a non-boolean', async () => {
    Menu.count = fn(async () => 1);
    Role.findOne = fn(async () => null);
    RoleMenu.bulkCreate = fn(async () => {});
    const created = [];
    Role.create = fn(async (values) => { created.push(values); return { id: 'role-new', ...values }; });

    let res = mockRes();
    await controller.createAccountRole(REQ({ body: { roleName: 'Front Desk', menuIds: ['m1'], signInLockedToWorkstations: true } }), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(created[0].signInLockedToWorkstations, true);
    assert.strictEqual(res.body.role.signInLockedToWorkstations, true);

    res = mockRes();
    await controller.createAccountRole(REQ({ body: { roleName: 'Pro Shop', menuIds: ['m1'] } }), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(created[1].signInLockedToWorkstations, false, 'off unless asked for');

    res = mockRes();
    await controller.createAccountRole(REQ({ body: { roleName: 'Caddy Master', menuIds: ['m1'], signInLockedToWorkstations: 'yes' } }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body.message, /true or false/);
    assert.strictEqual(created.length, 2, 'nothing created on refusal');
});

test('updateAccountRole changes the lock only when the flag is sent, and keeps it otherwise', async () => {
    const updates = [];
    const role = { id: 'role-fd', accountId: 'acct-X', name: 'Front Desk', signInLockedToWorkstations: false, update: fn(async (u) => { updates.push(u); }) };
    Role.findOne = fn(async () => role);
    Role.findByPk = fn(async () => ({ id: 'role-fd', name: 'Front Desk', signInLockedToWorkstations: true }));
    Menu.count = fn(async () => 1);
    RoleMenu.destroy = fn(async () => {});
    RoleMenu.bulkCreate = fn(async () => {});

    let res = mockRes();
    await controller.updateAccountRole(REQ({ params: { roleId: 'role-fd' }, body: { menuIds: ['m1'], signInLockedToWorkstations: true } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(updates[0], { signInLockedToWorkstations: true });
    assert.strictEqual(res.body.role.signInLockedToWorkstations, true);

    res = mockRes();
    await controller.updateAccountRole(REQ({ params: { roleId: 'role-fd' }, body: { menuIds: ['m1'], description: 'Counter staff' } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(updates[1], { description: 'Counter staff' }, 'the lock is untouched when not sent');
});

test('deleteTenantRole blocks deletion while users still hold the role (409)', async () => {
    Role.findOne = fn(async () => ({ id: 'role-2', companyId: 'company-A', name: 'Cashier', destroy: fn() }));
    CompanyUser.count = fn(async () => 3);
    RoleMenu.destroy = fn(async () => {});

    const res = mockRes();
    await controller.deleteTenantRole(
        REQ({ params: { roleId: 'role-2' }, query: {} }),
        res,
    );

    assert.strictEqual(res.statusCode, 409);
    assert.match(res.body.message, /3 user/i);
    assert.strictEqual(RoleMenu.destroy.calls.length, 0, 'must not delete grants when blocked');
    assert.strictEqual(tx.rollback.calls.length, 1);
});

test('deleteTenantRole hard-deletes an unused role and its grants (200)', async () => {
    const destroyed = fn(async () => {});
    Role.findOne = fn(async () => ({ id: 'role-2', companyId: 'company-A', name: 'Cashier', destroy: destroyed }));
    CompanyUser.count = fn(async () => 0);
    RoleMenu.destroy = fn(async () => {});

    const res = mockRes();
    await controller.deleteTenantRole(
        REQ({ params: { roleId: 'role-2' }, query: {} }),
        res,
    );

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(RoleMenu.destroy.calls[0][0].where, { roleId: 'role-2' });
    assert.strictEqual(destroyed.calls.length, 1, 'role itself must be destroyed');
    assert.strictEqual(tx.commit.calls.length, 1);
});

test('deleteTenantRole refuses to delete the system-managed Tenant Admin role (400)', async () => {
    Role.findOne = fn(async () => ({ id: 'role-admin', companyId: 'company-A', name: 'Tenant Admin', destroy: fn() }));
    CompanyUser.count = fn(async () => 0);

    const res = mockRes();
    await controller.deleteTenantRole(
        REQ({ params: { roleId: 'role-admin' }, query: {} }),
        res,
    );

    assert.strictEqual(res.statusCode, 400);
    assert.match(res.body.message, /system/i);
    assert.strictEqual(tx.rollback.calls.length, 1);
});
