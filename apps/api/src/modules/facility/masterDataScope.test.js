// Data scope on the facility masters (types, facilities, venues, instructors,
// closure plans, slot sets): the listing carries a per-row canModify and the
// amending paths refuse (403) a row outside the caller's scope.
// Models are stubbed; no database connection is made.
//
//   node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test } = require('node:test');
const assert = require('node:assert');

const CompanyUser = require('../saas/companyUser.model');
const Role = require('../saas/role.model');
const Position = require('../saas/position.model');
const FacilityType = require('./facilityType.model');
const FacilityTypeSlotSet = require('./facilityTypeSlotSet.model');
const Facility = require('./facility.model');
const FacilityVenue = require('./venue.model');
const FacilityInstructor = require('./instructor.model');
const FacilityClosurePlan = require('./facilityClosurePlan.model');
const FacilityClass = require('./class.model');
const FacilityClassSession = require('./classSession.model');

const types = require('./facilityType.controller');
const units = require('./facility.controller');
const venues = require('./venue.controller');
const instructors = require('./instructor.controller');
const closures = require('./closure.controller');
const slotSets = require('./slotSet.controller');

const USER = { id: 'user-1', companyId: 'co-1', isSystemAdmin: false };
const DENIED = /data scope does not allow/;

function mockRes() {
    const res = { statusCode: undefined, body: undefined };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

function mockReq(method, extra = {}) {
    return { method, user: USER, params: {}, query: {}, body: {}, ...extra };
}

// The caller: a non-admin role with the given data scope, no department rank.
function stubScope(dataScope) {
    CompanyUser.findOne = async () => ({ roleId: 'role-1', departmentId: null, positionId: null });
    Role.findByPk = async () => ({ name: 'Front Desk', dataScope });
    Position.findByPk = async () => null;
    CompanyUser.findAll = async () => [];
    Position.findAll = async () => [];
}

// A persisted-looking row that records whether a write reached it.
function row(Model, values) {
    const r = Model.build({ companyId: USER.companyId, ...values }, { isNewRecord: false });
    r.writes = [];
    r.save = async () => { r.writes.push('save'); return r; };
    r.destroy = async () => { r.writes.push('destroy'); };
    return r;
}

const mineAndTheirs = (Model, values = {}) => [
    row(Model, { id: 'r-1', code: 'MINE', ...values, createdBy: USER.id }),
    row(Model, { id: 'r-2', code: 'THEIRS', ...values, createdBy: 'other-user' }),
];

async function call(handler, req) {
    const res = mockRes();
    await handler(req, res);
    return res;
}

test("facility masters, scope 'own': every listing flags a row someone else created", async () => {
    stubScope('own');
    const noRows = async () => [];
    FacilityTypeSlotSet.findAll = noRows;
    FacilityClass.findAll = noRows;
    FacilityClassSession.findAll = noRows;

    FacilityType.findAll = async () => mineAndTheirs(FacilityType);
    Facility.findAll = noRows; // the unit counts
    let res = await call(types.list, mockReq('GET'));
    assert.deepStrictEqual(res.body.map((t) => [t.code, t.canModify]), [['MINE', true], ['THEIRS', false]]);

    Facility.findAll = async () => mineAndTheirs(Facility);
    res = await call(units.list, mockReq('GET'));
    assert.deepStrictEqual(res.body.map((u) => [u.code, u.canModify]), [['MINE', true], ['THEIRS', false]]);

    Facility.findAll = noRows; // the unit picker
    FacilityVenue.findAll = async () => mineAndTheirs(FacilityVenue);
    res = await call(venues.list, mockReq('GET'));
    assert.deepStrictEqual(res.body.venues.map((v) => [v.code, v.canModify]), [['MINE', true], ['THEIRS', false]]);

    FacilityInstructor.findAll = async () => mineAndTheirs(FacilityInstructor);
    res = await call(instructors.list, mockReq('GET'));
    assert.deepStrictEqual(res.body.map((i) => [i.code, i.canModify]), [['MINE', true], ['THEIRS', false]]);

    FacilityType.findAll = noRows; // the type picker
    FacilityClosurePlan.findAll = async () => [
        row(FacilityClosurePlan, { id: 'p-1', description: 'Mine', createdBy: USER.id }),
        row(FacilityClosurePlan, { id: 'p-2', description: 'Theirs', createdBy: 'other-user' }),
    ];
    res = await call(closures.list, mockReq('GET'));
    assert.deepStrictEqual(res.body.plans.map((p) => [p.description, p.canModify]), [['Mine', true], ['Theirs', false]]);
});

test("facility masters, scope 'all': every listed row is amendable", async () => {
    stubScope('all');
    FacilityInstructor.findAll = async () => mineAndTheirs(FacilityInstructor);
    FacilityClass.findAll = async () => [];
    FacilityClassSession.findAll = async () => [];
    const res = await call(instructors.list, mockReq('GET'));
    assert.deepStrictEqual(res.body.map((i) => i.canModify), [true, true]);
});

test("facility masters, scope 'own': update and delete of someone else's row are refused", async () => {
    stubScope('own');
    const cases = [
        ['facility type', FacilityType, types, { id: 'r-2' }],
        ['facility', Facility, units, { id: 'r-2' }],
        ['venue', FacilityVenue, venues, { id: 'r-2' }],
        ['instructor', FacilityInstructor, instructors, { id: 'r-2' }],
        ['closure plan', FacilityClosurePlan, closures, { planId: 'r-2' }],
    ];
    for (const [label, Model, controller, params] of cases) {
        const theirs = row(Model, { id: 'r-2', code: 'THEIRS', createdBy: 'other-user' });
        Model.findOne = async () => theirs;
        for (const [method, handler] of [['PATCH', controller.update], ['DELETE', controller.remove]]) {
            const res = await call(handler, mockReq(method, { params, body: { isActive: false } }));
            assert.strictEqual(res.statusCode, 403, `${label} ${method}`);
            assert.match(res.body.message, DENIED);
        }
        assert.deepStrictEqual(theirs.writes, [], `${label} must not be written`);
    }

    // The closure day list is part of the plan.
    const plan = row(FacilityClosurePlan, { id: 'r-2', createdBy: 'other-user' });
    FacilityClosurePlan.findOne = async () => plan;
    const res = await call(closures.saveDays, mockReq('PUT', { params: { planId: 'r-2' }, body: { days: [] } }));
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(plan.writes, []);
});

test("facility masters, scope 'own': the caller's own row passes the gate", async () => {
    stubScope('own');
    const mine = row(FacilityInstructor, { id: 'r-1', code: 'MINE', name: 'Mine', createdBy: USER.id });
    FacilityInstructor.findOne = async () => mine;
    FacilityClass.count = async () => 0;
    FacilityClassSession.count = async () => 0;
    const res = await call(instructors.remove, mockReq('DELETE', { params: { id: 'r-1' } }));
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(mine.writes, ['destroy']);
});

test("slot sets follow their facility type: scope 'own' cannot amend the sets of someone else's type", async () => {
    stubScope('own');
    const theirType = row(FacilityType, { id: 't-2', code: 'THEIRS', usageMode: 'slot', createdBy: 'other-user' });
    FacilityType.findOne = async () => theirType;
    // The set itself is the caller's own: the TYPE decides.
    const ownSet = row(FacilityTypeSlotSet, { id: 's-1', facilityTypeId: 't-2', createdBy: USER.id });
    FacilityTypeSlotSet.findOne = async () => ownSet;

    const params = { id: 't-2', setId: 's-1' };
    for (const [method, handler] of [['POST', slotSets.create], ['PATCH', slotSets.update], ['PUT', slotSets.saveSlots], ['DELETE', slotSets.remove]]) {
        const res = await call(handler, mockReq(method, { params, body: { slots: [] } }));
        assert.strictEqual(res.statusCode, 403, `slot set ${method}`);
        assert.match(res.body.message, DENIED);
    }
    assert.deepStrictEqual(ownSet.writes, []);

    // Reading them stays open.
    FacilityTypeSlotSet.findAll = async () => [];
    const res = await call(slotSets.list, mockReq('GET', { params }));
    assert.strictEqual(res.statusCode, 200);
});
