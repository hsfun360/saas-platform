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
        { id: AR, code: 'AR', name: 'Account Receivable' },
        { id: GOLF, code: 'GOLF', name: 'Golf Management' },
        { id: POS, code: 'POS', name: 'Point of Sale' },
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
gateway.registerConsumer({ moduleCode: 'AR', usageCheck: async () => false });
gateway.registerConsumer({ moduleCode: 'GOLF', usageCheck: async () => false });

test('availableModules = registered consumers INTERSECTED with the company subscriptions', async () => {
    stubModels({ subscribed: [AR, POS] });
    const available = await gateway.availableModules(COMPANY);
    // POS is subscribed but not a registered consumer; Golf is registered but
    // not subscribed. Neither may be ticked.
    assert.deepStrictEqual(available, [{ moduleId: AR, code: 'AR', name: 'Account Receivable' }]);
});

test('entryMeta returns only the dimensions the calling module applies to', async () => {
    stubModels();
    const ar = await gateway.entryMeta(COMPANY, 'AR');
    assert.deepStrictEqual(ar.map((c) => c.dimensionNo), [1], 'AR never sees the Golf-only dimension 6');

    const golf = await gateway.entryMeta(COMPANY, 'GOLF');
    assert.deepStrictEqual(golf.map((c) => c.dimensionNo), [1, 6]);
});

test('entryMeta carries each module OWN required flag', async () => {
    stubModels();
    const [arDept] = await gateway.entryMeta(COMPANY, 'AR');
    const [golfDept] = await gateway.entryMeta(COMPANY, 'GOLF');
    assert.strictEqual(arDept.isRequired, true, 'Department is mandatory on AR entry');
    assert.strictEqual(golfDept.isRequired, false, 'the same dimension is optional on Golf');
});

test('entryMeta is empty for a module nothing applies to', async () => {
    stubModels();
    assert.deepStrictEqual(await gateway.entryMeta(COMPANY, 'POS'), []);
});

test('readSelections rejects a dimension the calling module cannot stamp', async () => {
    stubModels();
    const res = await gateway.readSelections(COMPANY, { analysis: { 6: 'opt-van' } }, 'AR');
    assert.match(res.error, /does not apply to AR/);
});

test('readSelections accepts that same dimension from the module it applies to', async () => {
    stubModels();
    const res = await gateway.readSelections(COMPANY, { analysis: { 6: 'opt-van' } }, 'GOLF');
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(res.columns.analysis6Id, 'opt-van');
    assert.strictEqual(res.columns.analysis1Id, null);
});

test('readSelections enforces required per module, not per category', async () => {
    stubModels();
    const missingOnAr = await gateway.readSelections(COMPANY, { analysis: {} }, 'AR');
    assert.match(missingOnAr.error, /Department is required/);

    // Golf leaves the very same dimension optional.
    const missingOnGolf = await gateway.readSelections(COMPANY, { analysis: {} }, 'GOLF');
    assert.strictEqual(missingOnGolf.error, undefined);
    assert.strictEqual(missingOnGolf.columns.analysis1Id, null);
});

test('readSelections rejects an option that is not the picked dimension own', async () => {
    stubModels();
    const res = await gateway.readSelections(COMPANY, { analysis: { 1: 'opt-van' } }, 'GOLF');
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

// --- Hierarchy (Division -> Department -> Section, 2026-08-27) --------------
// The dimension NUMBERS are deliberately out of order against the hierarchy
// (Division is 3, Department is 1, Section is 4) because the parent link and
// the storage slot are unrelated by design.
// DEPARTMENT is the same id declared above; the hierarchy stub redefines every
// model read, so the two fixtures never overlap.
const DIVISION = 'cat-div';
const SECTION = 'cat-sect';

function stubHierarchy({ divisionRequired = false } = {}) {
    Module.findAll = async () => [{ id: AR, code: 'AR', name: 'Account Receivable' }];
    CompanyModule.findAll = async () => [{ moduleId: AR }];

    const rows = [
        { categoryId: DIVISION, moduleId: AR, isRequired: divisionRequired },
        { categoryId: DEPARTMENT, moduleId: AR, isRequired: false },
        { categoryId: SECTION, moduleId: AR, isRequired: false },
    ];
    DimensionCategoryModule.findAll = async ({ where }) => rows.filter((r) => r.moduleId === where.moduleId);

    DimensionCategory.findAll = async ({ where }) => {
        const wanted = where.id[Op.in];
        return [
            { id: DIVISION, name: 'Division', dimensionNo: 3, parentCategoryId: null },
            { id: DEPARTMENT, name: 'Department', dimensionNo: 1, parentCategoryId: DIVISION },
            { id: SECTION, name: 'Section', dimensionNo: 4, parentCategoryId: DEPARTMENT },
        ].filter((c) => wanted.includes(c.id));
    };

    DimensionOption.findAll = async ({ where }) => {
        const wanted = where.categoryId[Op.in];
        return [
            { id: 'opt-corp', categoryId: DIVISION, code: 'CORP', description: 'Corporate', parentOptionId: null },
            { id: 'opt-ops', categoryId: DIVISION, code: 'OPS', description: 'Operations', parentOptionId: null },
            { id: 'opt-hr', categoryId: DEPARTMENT, code: 'HR', description: 'Human Resources', parentOptionId: 'opt-corp' },
            { id: 'opt-fnb', categoryId: DEPARTMENT, code: 'FNB', description: 'Food & Beverage', parentOptionId: 'opt-ops' },
            { id: 'opt-loose', categoryId: DEPARTMENT, code: 'LOOSE', description: 'Not linked yet', parentOptionId: null },
            { id: 'opt-pay', categoryId: SECTION, code: 'PAY', description: 'Payroll', parentOptionId: 'opt-hr' },
        ].filter((o) => wanted.includes(o.categoryId));
    };
}

test('entryMeta withholds an UNASSIGNED option of a parented dimension', async () => {
    stubHierarchy();
    const meta = await gateway.entryMeta(COMPANY, 'AR');
    const dept = meta.find((c) => c.name === 'Department');
    // The stub ignores the query's ORDER BY, so compare as a set.
    assert.deepStrictEqual(dept.options.map((o) => o.code).sort(), ['FNB', 'HR'], 'LOOSE has no Division, so it is not offered');
    // The Division itself is unparented, so nothing is withheld there.
    const div = meta.find((c) => c.name === 'Division');
    assert.deepStrictEqual(div.options.map((o) => o.code).sort(), ['CORP', 'OPS']);
});

test('entryMeta reports the parent by DIMENSION NUMBER, which need not precede the child', async () => {
    stubHierarchy();
    const meta = await gateway.entryMeta(COMPANY, 'AR');
    const dept = meta.find((c) => c.name === 'Department');
    assert.strictEqual(dept.dimensionNo, 1);
    assert.strictEqual(dept.parentDimensionNo, 3, 'the parent sits on a HIGHER number - the link is semantic, not positional');
});

test('readSelections DERIVES the parent a picked child determines', async () => {
    stubHierarchy();
    const res = await gateway.readSelections(COMPANY, { analysis: { 1: 'opt-hr' } }, 'AR');
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(res.columns.analysis1Id, 'opt-hr');
    assert.strictEqual(res.columns.analysis3Id, 'opt-corp', 'the Division is stamped even though the clerk never picked it');
});

test('readSelections derives EVERY ancestor up a three-level chain', async () => {
    stubHierarchy();
    const res = await gateway.readSelections(COMPANY, { analysis: { 4: 'opt-pay' } }, 'AR');
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(res.columns.analysis4Id, 'opt-pay');
    assert.strictEqual(res.columns.analysis1Id, 'opt-hr');
    assert.strictEqual(res.columns.analysis3Id, 'opt-corp');
});

test('readSelections rejects an inconsistent pair the clerk picked by hand', async () => {
    stubHierarchy();
    const res = await gateway.readSelections(COMPANY, { analysis: { 1: 'opt-hr', 3: 'opt-ops' } }, 'AR');
    assert.match(res.error, /does not belong to the selected Division/);
});

test('readSelections accepts a consistent pair picked in full', async () => {
    stubHierarchy();
    const res = await gateway.readSelections(COMPANY, { analysis: { 1: 'opt-hr', 3: 'opt-corp' } }, 'AR');
    assert.strictEqual(res.error, undefined);
    assert.strictEqual(res.columns.analysis3Id, 'opt-corp');
});

test('a required parent is satisfied by derivation, not just by picking it', async () => {
    stubHierarchy({ divisionRequired: true });
    const viaChild = await gateway.readSelections(COMPANY, { analysis: { 1: 'opt-hr' } }, 'AR');
    assert.strictEqual(viaChild.error, undefined, 'picking the Department satisfies the required Division');
    assert.strictEqual(viaChild.columns.analysis3Id, 'opt-corp');

    const nothing = await gateway.readSelections(COMPANY, { analysis: {} }, 'AR');
    assert.match(nothing.error, /Division is required/);
});
