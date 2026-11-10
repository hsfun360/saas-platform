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
const Position = require('../modules/saas/position.model');
const { requireMenuAction, canModifyRecord, annotateCanModify } = require('./serviceContext');

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

// ---------------------------------------------------------------------------
// Data scope (Phase 3): canModifyRecord / annotateCanModify
// ---------------------------------------------------------------------------

// Stub one caller: their membership (role/department/position), their role's
// dataScope, their position's rank, and the record-owners' memberships.
function stubScope({ dataScope, callerDept, callerRank, owners = {} }) {
    CompanyUser.findOne = fn(async () => ({
        roleId: 'role-1',
        departmentId: callerDept ?? null,
        positionId: callerRank === null || callerRank === undefined ? null : 'pos-caller',
    }));
    Role.findByPk = fn(async () => ({ name: 'Front Desk', dataScope }));
    // Caller position (findByPk) and owner positions (findAll) share ids of the
    // form pos-<rank>. `owners` maps ownerUserId -> rank (or null = no position).
    Position.findByPk = fn(async () => ({ rank: callerRank, isActive: true }));
    CompanyUser.findAll = fn(async () => Object.entries(owners)
        .map(([userId, rank]) => ({ userId, positionId: rank === null ? null : `pos-${rank}` })));
    Position.findAll = fn(async ({ where }) => (where.id || [])
        .map((id) => ({ id, rank: Number(String(id).replace('pos-', '')), isActive: true })));
}

const rec = (createdBy, dept) => ({ createdBy, createdByDepartmentId: dept ?? null });

test('data scope: system admin is always allowed', async () => {
    CompanyUser.findOne = fn(async () => { throw new Error('must not be called'); });
    const ok = await canModifyRecord(mockReq('PUT', { ...USER, isSystemAdmin: true }), rec('someone-else', 'd1'));
    assert.strictEqual(ok, true);
});

test("data scope 'own': own record yes, someone else's no, legacy unowned no", async () => {
    stubScope({ dataScope: 'own', callerDept: 'd1', callerRank: 10 });
    const req = mockReq('PUT', USER);
    assert.strictEqual(await canModifyRecord(req, rec(USER.id, 'd1')), true);
    assert.strictEqual(await canModifyRecord(req, rec('other-user', 'd1')), false);
    assert.strictEqual(await canModifyRecord(req, rec(null, null)), false);
});

test("data scope 'department': strictly senior in the same department only", async () => {
    const req = mockReq('PUT', USER);

    // Supervisor (20) vs Staff owner (10), same department -> allowed.
    stubScope({ dataScope: 'department', callerDept: 'd1', callerRank: 20, owners: { 'staff-1': 10 } });
    assert.strictEqual(await canModifyRecord(req, rec('staff-1', 'd1')), true);

    // Peer (same rank) -> denied.
    stubScope({ dataScope: 'department', callerDept: 'd1', callerRank: 10, owners: { 'peer-1': 10 } });
    assert.strictEqual(await canModifyRecord(req, rec('peer-1', 'd1')), false);

    // Senior but DIFFERENT department -> denied.
    stubScope({ dataScope: 'department', callerDept: 'd1', callerRank: 30, owners: { 'staff-2': 10 } });
    assert.strictEqual(await canModifyRecord(req, rec('staff-2', 'd2')), false);

    // Owner with no position counts as most junior -> senior allowed.
    stubScope({ dataScope: 'department', callerDept: 'd1', callerRank: 20, owners: { 'newbie': null } });
    assert.strictEqual(await canModifyRecord(req, rec('newbie', 'd1')), true);

    // Legacy unowned row -> denied (only 'all' scope).
    stubScope({ dataScope: 'department', callerDept: 'd1', callerRank: 30 });
    assert.strictEqual(await canModifyRecord(req, rec(null, 'd1')), false);
});

test("data scope 'department': caller without placement falls back to own-only", async () => {
    const req = mockReq('PUT', USER);
    stubScope({ dataScope: 'department', callerDept: null, callerRank: null, owners: { 'staff-1': 10 } });
    assert.strictEqual(await canModifyRecord(req, rec('staff-1', 'd1')), false);
    assert.strictEqual(await canModifyRecord(req, rec(USER.id, 'd1')), true);
});

test('data scope: annotateCanModify flags a whole listing in one pass', async () => {
    stubScope({ dataScope: 'department', callerDept: 'd1', callerRank: 20, owners: { 'staff-1': 10, 'boss-1': 30 } });
    const flags = await annotateCanModify(mockReq('GET', USER), [
        rec(USER.id, 'd1'),      // own -> true
        rec('staff-1', 'd1'),    // junior, same dept -> true
        rec('boss-1', 'd1'),     // senior owner -> false
        rec('staff-1', 'd2'),    // junior, other dept -> false
        rec(null, null),         // legacy unowned -> false
    ]);
    assert.deepStrictEqual(flags, [true, true, false, false, false]);
});

// ---------------------------------------------------------------------------
// The flag must reach the LISTING DTO, not just come back from the helper.
// Many listings call `await annotateCanModify(req, rows)` and let their DTO
// builder read `row.get('canModify')`; that only works because the helper
// also stamps each Sequelize instance. These tests drive real listings.
// ---------------------------------------------------------------------------

const Golfer = require('../modules/golf/golfer.model');
const RainCheck = require('../modules/golf/rainCheck.model');
const golferController = require('../modules/golf/golfer.controller');
const rainChecks = require('../modules/golf/rainCheck.service');

// A persisted-looking instance, as findAll returns.
const persisted = (Model, values) => Model.build(values, { isNewRecord: false });

test('data scope: annotateCanModify stamps Sequelize instances and leaves plain objects alone', async () => {
    stubScope({ dataScope: 'own', callerDept: 'd1', callerRank: 10 });
    const mine = persisted(Golfer, { id: 'g-1', name: 'Mine', createdBy: USER.id });
    const theirs = persisted(Golfer, { id: 'g-2', name: 'Theirs', createdBy: 'other-user' });
    const plain = rec('other-user', 'd1');

    const flags = await annotateCanModify(mockReq('GET', USER), [mine, theirs, plain]);

    assert.deepStrictEqual(flags, [true, false, false]);
    assert.strictEqual(mine.get('canModify'), true);
    assert.strictEqual(theirs.get('canModify'), false);
    assert.strictEqual('canModify' in plain, false);
    // Not a column: the stamp must not mark the row changed, or a later save()
    // and the audit hooks (which diff instance.changed()) would pick it up.
    assert.strictEqual(mine.changed('canModify'), false);
    assert.strictEqual(theirs.changed('canModify'), false);
});

test("data scope 'own': a listing DTO carries false for a row someone else created", async () => {
    stubScope({ dataScope: 'own', callerDept: 'd1', callerRank: 10 });
    Golfer.findAll = fn(async () => [
        persisted(Golfer, { id: 'g-1', name: 'Mine', createdBy: USER.id }),
        persisted(Golfer, { id: 'g-2', name: 'Theirs', createdBy: 'other-user' }),
        persisted(Golfer, { id: 'g-3', name: 'Legacy', createdBy: null }),
    ]);
    const res = mockRes();
    await golferController.list(mockReq('GET', USER), res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.golfers.map((g) => [g.name, g.canModify]), [
        ['Mine', true],
        ['Theirs', false],
        ['Legacy', false],
    ]);

    // The same rows under scope 'all' are all amendable.
    stubScope({ dataScope: 'all', callerDept: 'd1', callerRank: 10 });
    const resAll = mockRes();
    await golferController.list(mockReq('GET', USER), resAll);
    assert.deepStrictEqual(resAll.body.golfers.map((g) => g.canModify), [true, true, true]);
});

test("data scope 'own': a service listing and its single-record read carry the real flag", async () => {
    stubScope({ dataScope: 'own', callerDept: 'd1', callerRank: 10 });
    const req = mockReq('GET', USER);
    const mine = () => persisted(RainCheck, { id: 'rc-1', rainCheckNo: 'RC-1', status: 'issued', createdBy: USER.id });
    const theirs = () => persisted(RainCheck, { id: 'rc-2', rainCheckNo: 'RC-2', status: 'issued', createdBy: 'other-user' });

    RainCheck.findAll = fn(async () => [mine(), theirs()]);
    const listing = await rainChecks.list(req, {});
    assert.deepStrictEqual(listing.rainChecks.map((r) => [r.rainCheckNo, r.canModify]), [['RC-1', true], ['RC-2', false]]);

    RainCheck.findOne = fn(async () => theirs());
    assert.strictEqual((await rainChecks.get(req, 'rc-2')).rainCheck.canModify, false);
    RainCheck.findOne = fn(async () => mine());
    assert.strictEqual((await rainChecks.get(req, 'rc-1')).rainCheck.canModify, true);
});
