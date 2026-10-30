// Unit tests for the tenant-level MFA policy rules (securityPolicy.service):
// when a 'required' policy is in force, who the login gate must send to
// enrolment, and what the Security Policy screen is told. Pure helpers run
// without a DB; the state/apply helpers run against stubbed models.
//
// Runs on Node's built-in test runner (no external deps):  node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const Account = require('./account.model');
const Company = require('./company.model');
const CompanyUser = require('./companyUser.model');
const User = require('../identity/user.model');
const policy = require('./securityPolicy.service');

function fn(impl) {
    const f = (...args) => { f.calls.push(args); return impl ? impl(...args) : undefined; };
    f.calls = [];
    return f;
}

// ---- policyRequiresMfa: the calendar rule ----

test('optional policy never requires MFA', () => {
    assert.strictEqual(policy.policyRequiresMfa({ mfaPolicy: 'optional' }, '2026-10-30'), false);
    assert.strictEqual(policy.policyRequiresMfa(null, '2026-10-30'), false);
});

test('required with no date applies immediately', () => {
    assert.strictEqual(policy.policyRequiresMfa({ mfaPolicy: 'required', mfaRequiredFrom: null }, '2026-10-30'), true);
});

test('required from a date applies on that day, not before', () => {
    const acc = { mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01' };
    assert.strictEqual(policy.policyRequiresMfa(acc, '2026-10-31'), false);
    assert.strictEqual(policy.policyRequiresMfa(acc, '2026-11-01'), true);
    assert.strictEqual(policy.policyRequiresMfa(acc, '2027-01-15'), true);
});

// ---- enrolmentRequiredFor: the login-gate decision ----

test('a user who already has MFA is never sent to enrolment', () => {
    assert.deepStrictEqual(
        policy.enrolmentRequiredFor({ mfaEnabled: true, isSystemAdmin: true, roleName: 'Tenant Admin', policyRequires: true }),
        { required: false, reason: null },
    );
});

test('administrator roles are forced regardless of the account policy', () => {
    assert.deepStrictEqual(
        policy.enrolmentRequiredFor({ mfaEnabled: false, isSystemAdmin: false, roleName: 'Tenant Admin', policyRequires: false }),
        { required: true, reason: 'role' },
    );
    assert.deepStrictEqual(
        policy.enrolmentRequiredFor({ mfaEnabled: false, isSystemAdmin: true, roleName: 'User', policyRequires: false }),
        { required: true, reason: 'role' },
    );
});

test('an ordinary user is forced only when the organisation policy is in force', () => {
    assert.deepStrictEqual(
        policy.enrolmentRequiredFor({ mfaEnabled: false, isSystemAdmin: false, roleName: 'Cashier', policyRequires: true }),
        { required: true, reason: 'organisation' },
    );
    assert.deepStrictEqual(
        policy.enrolmentRequiredFor({ mfaEnabled: false, isSystemAdmin: false, roleName: 'Cashier', policyRequires: false }),
        { required: false, reason: null },
    );
});

// ---- getSecurityPolicyState: the expected result the screen shows ----

beforeEach(() => {
    Account.findByPk = fn(async () => ({ id: 'acct-X', ownerUserId: 'owner-1', mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01' }));
    Company.findAll = fn(async () => [{ id: 'c-1' }, { id: 'c-2' }]);
    // The owner also holds a membership row - counted once.
    CompanyUser.findAll = fn(async () => [{ userId: 'owner-1' }, { userId: 'u-2' }, { userId: 'u-3' }, { userId: 'u-2' }]);
    User.count = fn(async () => 1);
});

test('state counts each user once and reports how many have not enrolled', async () => {
    const state = await policy.getSecurityPolicyState('acct-X', '2026-10-30');
    assert.deepStrictEqual(state, {
        mfaPolicy: 'required',
        mfaRequiredFrom: '2026-11-01',
        effective: false, // starts 2026-11-01, "today" is 2026-10-30
        users: 3,
        enrolled: 1,
        notEnrolled: 2,
    });
    // The enrolled count was asked for exactly the distinct policy users.
    const where = User.count.calls[0][0].where;
    assert.deepStrictEqual([...where.id[Object.getOwnPropertySymbols(where.id)[0]]].sort(), ['owner-1', 'u-2', 'u-3']);
});

// ---- applySecurityPolicy: validation + the date-clearing rule ----

test('apply refuses an unknown policy and a malformed date', async () => {
    const saved = [];
    Account.findByPk = fn(async () => ({ id: 'acct-X', save: async function () { saved.push({ ...this }); } }));
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'mandatory' }), { error: 400, message: 'mfaPolicy must be optional or required.' });
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'required', mfaRequiredFrom: '1/11/2026' }), { error: 400, message: 'mfaRequiredFrom must be a date (YYYY-MM-DD).' });
    assert.strictEqual(saved.length, 0);
});

test('apply stores the date only while required, and clears it when optional', async () => {
    const row = { id: 'acct-X', mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01', save: async () => {} };
    Account.findByPk = fn(async () => row);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', mfaRequiredFrom: '2026-11-01' }), { ok: true });
    assert.strictEqual(row.mfaPolicy, 'optional');
    assert.strictEqual(row.mfaRequiredFrom, null);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'required', mfaRequiredFrom: '2026-12-01' }), { ok: true });
    assert.strictEqual(row.mfaRequiredFrom, '2026-12-01');
});
