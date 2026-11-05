// Unit tests for the tenant-level security policy rules (securityPolicy.service):
// when a 'required' MFA policy is in force, who the login gate must send to
// enrolment, the trusted-device rule, and what the Security Policy screen is
// told. Pure helpers run without a DB; the state/apply helpers run against
// stubbed models.
//
// Runs on Node's built-in test runner (no external deps):  node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const Account = require('./account.model');
const Company = require('./company.model');
const CompanyUser = require('./companyUser.model');
const User = require('../identity/user.model');
const TrustedDevice = require('../identity/trustedDevice.model');
const RegisteredWorkstation = require('../identity/registeredWorkstation.model');
const Role = require('./role.model');
const RemoteAccessGrant = require('../identity/remoteAccessGrant.model');
const RefreshToken = require('../identity/refreshToken.model');
const policy = require('./securityPolicy.service');
const mfa = require('../identity/mfa.service');

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

// ---- trustedDevicePolicy: the "don't ask again" rule ----

test('no account (System Administration) and a fresh account both get the platform default', () => {
    assert.deepStrictEqual(policy.trustedDevicePolicy(null), { allowed: true, days: 30 });
    assert.deepStrictEqual(policy.trustedDevicePolicy({ mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 30 }), { allowed: true, days: 30 });
});

test('the account may switch trusted devices off or shorten the window; out-of-range values fall back to the default', () => {
    assert.deepStrictEqual(policy.trustedDevicePolicy({ mfaTrustedDevicesAllowed: false, mfaTrustedDeviceDays: 7 }), { allowed: false, days: 7 });
    assert.deepStrictEqual(policy.trustedDevicePolicy({ mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 1 }), { allowed: true, days: 1 });
    assert.deepStrictEqual(policy.trustedDevicePolicy({ mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 90 }), { allowed: true, days: 90 });
    assert.deepStrictEqual(policy.trustedDevicePolicy({ mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 0 }), { allowed: true, days: 30 });
    assert.deepStrictEqual(policy.trustedDevicePolicy({ mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 91 }), { allowed: true, days: 30 });
    assert.deepStrictEqual(policy.trustedDevicePolicy({ mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 'x' }), { allowed: true, days: 30 });
});

test('trustedDevicePolicyForAccount reads only the two columns and defaults without an account id', async () => {
    assert.deepStrictEqual(await policy.trustedDevicePolicyForAccount(null), { allowed: true, days: 30 });
    Account.findByPk = fn(async () => ({ id: 'acct-X', mfaTrustedDevicesAllowed: false, mfaTrustedDeviceDays: 14 }));
    assert.deepStrictEqual(await policy.trustedDevicePolicyForAccount('acct-X'), { allowed: false, days: 14 });
    assert.deepStrictEqual(Account.findByPk.calls[0], ['acct-X', { attributes: ['id', 'mfaTrustedDevicesAllowed', 'mfaTrustedDeviceDays'] }]);
});

// ---- getSecurityPolicyState: the expected result the screen shows ----

beforeEach(() => {
    Account.findByPk = fn(async () => ({ id: 'acct-X', ownerUserId: 'owner-1', mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01', mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 14, workstationTrustEnabled: true, remoteAccessGrantMaxDays: 7, sessionLimitEnabled: true, maxConcurrentSessions: 1 }));
    Company.findAll = fn(async () => [{ id: 'c-1' }, { id: 'c-2' }]);
    // The owner also holds a membership row - counted once.
    CompanyUser.findAll = fn(async () => [{ userId: 'owner-1' }, { userId: 'u-2' }, { userId: 'u-3' }, { userId: 'u-2' }]);
    User.count = fn(async () => 1);
    TrustedDevice.count = fn(async () => 2);
    RegisteredWorkstation.count = fn(async () => 1);
    // First call = roles locked to workstations, second = roles exempt from the session limit.
    Role.count = fn(async ({ where }) => (where.sessionLimitExempt ? 1 : 2));
    // First call = grants in force, second = requests waiting.
    RemoteAccessGrant.count = fn(async ({ where }) => (where.status === 'approved' ? 1 : 3));
    // Live sessions: u-2 holds two families (over a limit of 1), u-3 one.
    RefreshToken.findAll = fn(async () => [
        { userId: 'u-2', familyId: 'f-1' }, { userId: 'u-2', familyId: 'f-1' }, { userId: 'u-2', familyId: 'f-2' },
        { userId: 'u-3', familyId: 'f-3' },
    ]);
});

test('state counts each user once and reports how many have not enrolled and how many devices skip the code', async () => {
    const state = await policy.getSecurityPolicyState('acct-X', '2026-10-30');
    assert.deepStrictEqual(state, {
        mfaAvailable: mfa.isMfaConfigured(), // mirrors the process env (a local .env may carry MFA_ENCRYPTION_KEY)
        mfaPolicy: 'required',
        mfaRequiredFrom: '2026-11-01',
        effective: false, // starts 2026-11-01, "today" is 2026-10-30
        users: 3,
        enrolled: 1,
        notEnrolled: 2,
        trustedDevicesAllowed: true,
        trustedDeviceDays: 14,
        trustedDevices: 2,
        workstationTrustEnabled: true,
        workstations: 1,
        lockedRoles: 2,
        remoteAccessGrantMaxDays: 7,
        activeGrants: 1,
        pendingRequests: 3,
        sessionLimitEnabled: true,
        maxConcurrentSessions: 1,
        exemptRoles: 1,
        signedInUsers: 2,
        liveSessions: 3,
        usersOverLimit: 1,
    });
    // Locked roles are counted for the account only.
    assert.deepStrictEqual(Role.count.calls[0][0].where, { accountId: 'acct-X', signInLockedToWorkstations: true });
    assert.deepStrictEqual(Role.count.calls[1][0].where, { accountId: 'acct-X', sessionLimitExempt: true });
    // Live sessions are the policy users' unrevoked, unexpired families in the account's companies.
    const rtWhere = RefreshToken.findAll.calls[0][0].where;
    assert.strictEqual(rtWhere.revokedAt, null);
    assert.deepStrictEqual([...rtWhere.userId[Object.getOwnPropertySymbols(rtWhere.userId)[0]]].sort(), ['owner-1', 'u-2', 'u-3']);
    // The station count is the account's live rows (not revoked, not expired).
    const wsWhere = RegisteredWorkstation.count.calls[0][0].where;
    assert.strictEqual(wsWhere.accountId, 'acct-X');
    assert.strictEqual(wsWhere.revokedAt, null);
    // The enrolled count was asked for exactly the distinct policy users.
    const where = User.count.calls[0][0].where;
    assert.deepStrictEqual([...where.id[Object.getOwnPropertySymbols(where.id)[0]]].sort(), ['owner-1', 'u-2', 'u-3']);
    // The device count is bounded by the CURRENT window (createdAt within 14 days), not the stored expiry alone.
    const tdWhere = TrustedDevice.count.calls[0][0].where;
    assert.strictEqual(tdWhere.revokedAt, null);
    const since = tdWhere.createdAt[Object.getOwnPropertySymbols(tdWhere.createdAt)[0]];
    const ageDays = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
    assert.ok(ageDays > 13.99 && ageDays < 14.01, `window edge ~14 days ago, got ${ageDays}`);
});

test('with trusted devices switched off the state reports zero honoured devices without counting', async () => {
    Account.findByPk = fn(async () => ({ id: 'acct-X', ownerUserId: 'owner-1', mfaPolicy: 'optional', mfaRequiredFrom: null, mfaTrustedDevicesAllowed: false, mfaTrustedDeviceDays: 30 }));
    const state = await policy.getSecurityPolicyState('acct-X', '2026-10-30');
    // Stations default to OFF for an account that never set the switch; the
    // live count is still reported so the screen can say what Save enables.
    assert.strictEqual(state.workstationTrustEnabled, false);
    assert.strictEqual(state.workstations, 1);
    assert.strictEqual(state.trustedDevicesAllowed, false);
    assert.strictEqual(state.trustedDevices, 0);
    assert.strictEqual(TrustedDevice.count.calls.length, 0);
});

// ---- sessionLimitPolicy / sessionLimitFor: the concurrent-session rule ----

test('the session rule defaults to ON with one device, and an out-of-range count falls back to one', () => {
    assert.deepStrictEqual(policy.sessionLimitPolicy({ sessionLimitEnabled: true, maxConcurrentSessions: 3 }), { enabled: true, max: 3 });
    assert.deepStrictEqual(policy.sessionLimitPolicy({ sessionLimitEnabled: false, maxConcurrentSessions: 2 }), { enabled: false, max: 2 });
    assert.deepStrictEqual(policy.sessionLimitPolicy({ maxConcurrentSessions: 99 }), { enabled: true, max: 1 });
    assert.deepStrictEqual(policy.sessionLimitPolicy({}), { enabled: true, max: 1 });
    // No account = the System Administration workspace: no limit.
    assert.deepStrictEqual(policy.sessionLimitPolicy(null), { enabled: false, max: 1 });
});

test('the limit applies to tenant sessions only, not to exempt roles, platform admins or the platform workspace', () => {
    const account = { sessionLimitEnabled: true, maxConcurrentSessions: 2 };
    assert.deepStrictEqual(policy.sessionLimitFor({ account, companyId: 'c-1' }), { max: 2 });
    // The Tenant Admin role is governed like everyone else (only the role flag exempts).
    assert.deepStrictEqual(policy.sessionLimitFor({ account, companyId: 'c-1', roleExempt: false }), { max: 2 });
    assert.strictEqual(policy.sessionLimitFor({ account, companyId: 'c-1', roleExempt: true }), null);
    assert.strictEqual(policy.sessionLimitFor({ account, companyId: 'c-1', isSystemAdmin: true }), null);
    assert.strictEqual(policy.sessionLimitFor({ account, companyId: null }), null);
    assert.strictEqual(policy.sessionLimitFor({ account: { sessionLimitEnabled: false }, companyId: 'c-1' }), null);
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

test('apply refuses a trusted-device window outside 1-90 days or a non-boolean switch, and saves nothing', async () => {
    const saves = [];
    Account.findByPk = fn(async () => ({ id: 'acct-X', mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 30, save: async () => saves.push(1) }));
    const bad = 'trustedDeviceDays must be a whole number from 1 to 90.';
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', trustedDeviceDays: 0 }), { error: 400, message: bad });
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', trustedDeviceDays: 91 }), { error: 400, message: bad });
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', trustedDeviceDays: 7.5 }), { error: 400, message: bad });
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', trustedDevicesAllowed: 'no' }), { error: 400, message: 'trustedDevicesAllowed must be true or false.' });
    assert.strictEqual(saves.length, 0);
});

test('apply keeps the stored trusted-device rule when the keys are omitted, and stores them when given', async () => {
    const row = { id: 'acct-X', mfaPolicy: 'optional', mfaRequiredFrom: null, mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 30, save: async () => {} };
    Account.findByPk = fn(async () => row);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional' }), { ok: true });
    assert.strictEqual(row.mfaTrustedDevicesAllowed, true);
    assert.strictEqual(row.mfaTrustedDeviceDays, 30);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', trustedDevicesAllowed: false, trustedDeviceDays: 7 }), { ok: true });
    assert.strictEqual(row.mfaTrustedDevicesAllowed, false);
    assert.strictEqual(row.mfaTrustedDeviceDays, 7);
    // The window is kept even while the switch is off, so turning it back on restores the chosen days.
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', trustedDevicesAllowed: true }), { ok: true });
    assert.strictEqual(row.mfaTrustedDeviceDays, 7);
});

// ---- Registered workstations: the switch on the same row ----

test('workstationTrustEnabled is off unless the account stored true, and the System Administration workspace never has it', () => {
    assert.strictEqual(policy.workstationTrustEnabled(null), false);
    assert.strictEqual(policy.workstationTrustEnabled({ id: 'acct-X' }), false);
    assert.strictEqual(policy.workstationTrustEnabled({ id: 'acct-X', workstationTrustEnabled: false }), false);
    assert.strictEqual(policy.workstationTrustEnabled({ id: 'acct-X', workstationTrustEnabled: true }), true);
});

test('the remote-access ceiling defaults to 30 and refuses anything outside 1-90, keeping the stored value when omitted', async () => {
    assert.deepStrictEqual(policy.remoteAccessPolicy(null), { maxDays: 30 });
    assert.deepStrictEqual(policy.remoteAccessPolicy({ remoteAccessGrantMaxDays: 500 }), { maxDays: 30 });
    assert.deepStrictEqual(policy.remoteAccessPolicy({ remoteAccessGrantMaxDays: 14 }), { maxDays: 14 });
    const saves = [];
    const row = { id: 'acct-X', mfaPolicy: 'optional', mfaRequiredFrom: null, mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 30, remoteAccessGrantMaxDays: 14, save: async () => saves.push(1) };
    Account.findByPk = fn(async () => row);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional' }), { ok: true });
    assert.strictEqual(row.remoteAccessGrantMaxDays, 14);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', remoteAccessGrantMaxDays: 90 }), { ok: true });
    assert.strictEqual(row.remoteAccessGrantMaxDays, 90);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', remoteAccessGrantMaxDays: 91 }), { error: 400, message: 'remoteAccessGrantMaxDays must be a whole number from 1 to 90.' });
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', remoteAccessGrantMaxDays: 0 }), { error: 400, message: 'remoteAccessGrantMaxDays must be a whole number from 1 to 90.' });
    assert.strictEqual(saves.length, 2);
});

test('apply keeps the stored workstation switch when omitted, stores a boolean, and refuses anything else', async () => {
    const saves = [];
    const row = { id: 'acct-X', mfaPolicy: 'optional', mfaRequiredFrom: null, mfaTrustedDevicesAllowed: true, mfaTrustedDeviceDays: 30, workstationTrustEnabled: true, save: async () => saves.push(1) };
    Account.findByPk = fn(async () => row);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional' }), { ok: true });
    assert.strictEqual(row.workstationTrustEnabled, true);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', workstationTrustEnabled: false }), { ok: true });
    assert.strictEqual(row.workstationTrustEnabled, false);
    assert.strictEqual(saves.length, 2);
    assert.deepStrictEqual(await policy.applySecurityPolicy('acct-X', { mfaPolicy: 'optional', workstationTrustEnabled: 'yes' }), { error: 400, message: 'workstationTrustEnabled must be true or false.' });
    assert.strictEqual(saves.length, 2);
});
