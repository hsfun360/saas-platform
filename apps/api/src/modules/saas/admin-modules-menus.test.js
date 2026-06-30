// Unit tests for the System-Admin Modules & Menus maintenance endpoints.
// Covers create/update/delete guards for modules and menus. Models are stubbed;
// no database connection is made.
//
//   node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const Module = require('./module.model');
const Menu = require('./menu.model');
const RoleMenu = require('./roleMenu.model');
const CompanyModule = require('./companyModule.model');
const { sequelize } = require('../../platform/db');
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

function fakeTx() {
    return { finished: false, commit: fn(async () => {}), rollback: fn(async () => {}) };
}

let tx;
beforeEach(() => {
    tx = fakeTx();
    sequelize.transaction = fn(async () => tx);
});

// --- Modules ---

test('createModule rejects a blank name (400)', async () => {
    const res = mockRes();
    await controller.createModule({ body: { name: '   ' } }, res);
    assert.strictEqual(res.statusCode, 400);
});

test('createModule rejects a duplicate name (409)', async () => {
    Module.findOne = fn(async () => ({ id: 'mod-x', name: 'Golf' }));
    Module.create = fn(async () => ({}));
    const res = mockRes();
    await controller.createModule({ body: { name: 'Golf' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(Module.create.calls.length, 0, 'must not create a duplicate');
});

test('createModule creates a new module (201)', async () => {
    Module.findOne = fn(async () => null);
    Module.create = fn(async (data) => ({ id: 'mod-1', ...data }));
    const res = mockRes();
    await controller.createModule({ body: { name: '  Golf  ', icon: 'sports_golf', description: ' Tee times ' } }, res);
    assert.strictEqual(res.statusCode, 201);
    const created = Module.create.calls[0][0];
    assert.strictEqual(created.name, 'Golf');
    assert.strictEqual(created.icon, 'sports_golf');
    assert.strictEqual(created.description, 'Tee times');
});

test('deleteModule is blocked while companies still subscribe (409)', async () => {
    Module.findByPk = fn(async () => ({ id: 'mod-1', name: 'Golf', destroy: fn() }));
    CompanyModule.count = fn(async () => 2);
    Menu.destroy = fn(async () => {});
    const res = mockRes();
    await controller.deleteModule({ params: { moduleId: 'mod-1' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.match(res.body.message, /2 company/i);
    assert.strictEqual(Menu.destroy.calls.length, 0, 'must not cascade when blocked');
    assert.strictEqual(tx.rollback.calls.length, 1);
});

test('deleteModule cascades menus + RoleMenu grants when unused (200)', async () => {
    const destroyed = fn(async () => {});
    Module.findByPk = fn(async () => ({ id: 'mod-1', name: 'Golf', destroy: destroyed }));
    CompanyModule.count = fn(async () => 0);
    Menu.findAll = fn(async () => [{ id: 'menu-1' }, { id: 'menu-2' }]);
    RoleMenu.destroy = fn(async () => {});
    Menu.destroy = fn(async () => {});
    const res = mockRes();
    await controller.deleteModule({ params: { moduleId: 'mod-1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(RoleMenu.destroy.calls[0][0].where, { menuId: ['menu-1', 'menu-2'] });
    assert.deepStrictEqual(Menu.destroy.calls[0][0].where, { id: ['menu-1', 'menu-2'] });
    assert.strictEqual(destroyed.calls.length, 1, 'the module itself must be destroyed');
    assert.strictEqual(tx.commit.calls.length, 1);
});

// --- Menus ---

test('createMenu rejects when required fields are missing (400)', async () => {
    const res = mockRes();
    await controller.createMenu({ body: { name: 'Tee Times' } }, res); // no route/moduleId
    assert.strictEqual(res.statusCode, 400);
});

test('createMenu rejects a non-existent module (400)', async () => {
    Module.findByPk = fn(async () => null);
    Menu.create = fn(async () => ({}));
    const res = mockRes();
    await controller.createMenu({ body: { name: 'Tee Times', route: '/golf/tee', moduleId: 'nope' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(Menu.create.calls.length, 0);
});

test('createMenu creates a menu under an existing module (201)', async () => {
    Module.findByPk = fn(async () => ({ id: 'mod-1' }));
    Menu.create = fn(async (data) => ({ id: 'menu-1', ...data }));
    const res = mockRes();
    await controller.createMenu({ body: { name: ' Tee Times ', route: ' /golf/tee ', moduleId: 'mod-1' } }, res);
    assert.strictEqual(res.statusCode, 201);
    const created = Menu.create.calls[0][0];
    assert.strictEqual(created.name, 'Tee Times');
    assert.strictEqual(created.route, '/golf/tee');
    assert.strictEqual(created.moduleId, 'mod-1');
    assert.strictEqual(created.parentId, null);
});

test('deleteMenu removes the menu and its RoleMenu grants (200)', async () => {
    const destroyed = fn(async () => {});
    Menu.findByPk = fn(async () => ({ id: 'menu-1', destroy: destroyed }));
    RoleMenu.destroy = fn(async () => {});
    const res = mockRes();
    await controller.deleteMenu({ params: { menuId: 'menu-1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(RoleMenu.destroy.calls[0][0].where, { menuId: 'menu-1' });
    assert.strictEqual(destroyed.calls.length, 1);
    assert.strictEqual(tx.commit.calls.length, 1);
});

test('updateMenu rejects moving a menu to a non-existent module (400)', async () => {
    Menu.findByPk = fn(async () => ({ id: 'menu-1', update: fn() }));
    Module.findByPk = fn(async () => null);
    const res = mockRes();
    await controller.updateMenu({ params: { menuId: 'menu-1' }, body: { moduleId: 'ghost' } }, res);
    assert.strictEqual(res.statusCode, 400);
});
