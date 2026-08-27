// Unit tests for the Dimension gateway's PER-MODULE applicability (2026-08-27):
// the catalog and the dimension number are company-global, but which modules
// offer a dimension - and where it is mandatory - is per module.
// Models are stubbed; no database connection is made.
//
//   node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test } = require('node:test');
const assert = require('node:assert');
const { Op } = require('sequelize');

const Module = require('../modules/saas/module.model');
const CompanyModule = require('../modules/saas/companyModule.model');
const DimensionCategory = require('../modules/dimension/dimensionCategory.model');
const DimensionCategoryModule = require('../modules/dimension/dimensionCategoryModule.model');
const DimensionOption = require('../modules/dimension/dimensionOption.model');
const gateway = require('./dimensionGateway');

const COMPANY = 'co-1';
const AR = 'mod-ar';
const GOLF = 'mod-golf';
const POS = 'mod-pos';

// 'Department' (Dimension 1) applies to AR + Golf; 'Vehicle' (Dimension 6) is
// a Golf-only expenditure dimension an AR clerk must never see.
const DEPARTMENT = 'cat-dept';
const VEHICLE = 'cat-vehicle';

function stubModels({ subscribed = [AR, GOLF], applies = null } = {}) {
    Module.findAll = async () => [
        { id: AR, name: 'Account Receivable' },
        { id: GOLF, name: 'Golf Management' },
        { id: POS, name: 'Point of Sale' },
    ];
    CompanyModule.findAll = async () => subscribed.map((moduleId) => ({ moduleId }));

    const rows = applies || [
        { categoryId: DEPARTMENT, moduleId: AR, isRequired: true },
        { categoryId: DEPARTMENT, moduleId: GOLF, isRequired: false },
        { categoryId: VEHICLE, moduleId: GOLF, isRequired: false },
    ];
    DimensionCategoryModule.findAll = async ({ where }) =>
        rows.filter((r) => r.moduleId === where.moduleId);

    DimensionCategory.findAll = async ({ where }) => {
        const wanted = where.id[Op.in];
        return [
            { id: DEPARTMENT, name: 'Department', dimensionNo: 1 },
            { id: VEHICLE, name: 'Company vehicle', dimensionNo: 6 },
        ].filter((c) => wanted.includes(c.id));
    };

    DimensionOption.findAll = async ({ where }) => {
        const wanted = where.categoryId[Op.in];
        return [
            { id: 'opt-hr', categoryId: DEPARTMENT, code: 'HR', description: 'Human Resources' },
            { id: 'opt-van', categoryId: VEHICLE, code: 'VAN', description: 'Delivery van' },
        ].filter((o) => wanted.includes(o.categoryId));
    };
}

// The registry is module-level state shared by every test in this file.
gateway.registerConsumer({ moduleName: 'Account Receivable', usageCheck: async () => false });
gateway.registerConsumer({ moduleName: 'Golf Management', usageCheck: async () => false });

test('availableModules = registered consumers INTERSECTED with the company subscriptions', async () => {
    stubModels({ subscribed: [AR, POS] });
    const available = await gateway.availableModules(COMPANY);
    // POS is subscribed but not a registered consumer; Golf is registered but
    // not subscribed. Neither may be ticked.
    assert.deepStrictEqual(available, [{ moduleId: AR, name: 'Account Receivable' }]);
});

test('entryMeta returns only the dimensions the calling module applies to', async () => {
    stubModels();
    const ar = await gateway.entryMeta(COMPANY, 'Account Receivable');
    assert.deepStrictEqual(ar.map((c) => c.dimensionNo), [1], 'AR never sees the Golf-only dimension 6');

    const golf = await gateway.entryMeta(COMPANY, 'Golf Management');
    assert.deepStrictEqual(golf.map((c) => c.dimensionNo), [1, 6]);
});

test('entryMeta carries each module OWN required flag', async () => {
    stubModels();
    const [arDept] = await gateway.entryMeta(COMPANY, 'Account Receivable');
    const [golfDept] = await gateway.entryMeta(COMPANY, 'Golf Management');
    assert.strictEqual(arDept.isRequired, true, 'Department is mandatory on AR entry');
    assert.strictEqual(golfDept.isRequired, false, 'the same dimension is optional on Golf');
});

test('entryMeta is empty for a module nothing applies to', async () => {
    stubModels();
    assert.deepStrictEqual(await gateway.entryMeta(COMPANY, 'Point of Sale'), []);
});

test('readSelections rejects a dimension the calling module cannot stamp', async () => {
    stubModels();
    const res = await gateway.readSelections(COMPANY, { analysis: { 6: 'opt-van' } }, 'Account Receivable');
    assert.match(res.error, /does not apply to Account Receivable/);
});

test('readSelections accepts that same dimension from the module it applies to', async () => {
    stubModels();
    const res = await gateway.readSelections(COMPANY, { analysis: { 6: 'opt-van' } }, 'Golf Management');
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(res.columns.analysis6Id, 'opt-van');
    assert.strictEqual(res.columns.analysis1Id, null);
});

test('readSelections enforces required per module, not per category', async () => {
    stubModels();
    const missingOnAr = await gateway.readSelections(COMPANY, { analysis: {} }, 'Account Receivable');
    assert.match(missingOnAr.error, /Department is required/);

    // Golf leaves the very same dimension optional.
    const missingOnGolf = await gateway.readSelections(COMPANY, { analysis: {} }, 'Golf Management');
    assert.strictEqual(missingOnGolf.error, undefined);
    assert.strictEqual(missingOnGolf.columns.analysis1Id, null);
});

test('readSelections rejects an option that is not the picked dimension own', async () => {
    stubModels();
    const res = await gateway.readSelections(COMPANY, { analysis: { 1: 'opt-van' } }, 'Golf Management');
    assert.match(res.error, /Select a valid Department option/);
});

test('copyColumns is unfiltered by applicability - inherited stamps always survive', () => {
    // A Golf sale that charges to account hands its analysis ids to the AR
    // ledger row; restricting dimension 6 from AR must not strip them.
    const columns = gateway.copyColumns({ analysis1Id: 'opt-hr', analysis6Id: 'opt-van' });
    assert.strictEqual(columns.analysis6Id, 'opt-van');
    assert.strictEqual(columns.analysis1Id, 'opt-hr');
    assert.strictEqual(columns.analysis3Id, null);
});
