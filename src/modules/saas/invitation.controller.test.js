// Unit tests for the invitation CONSENT GATE — the rule that only the invited
// identity can act on an invitation, and that a non-addressee is indistinguishable
// from a missing invitation (so invitation IDs can't be probed).
//
// Runs on Node's built-in test runner (no external deps):  node --test
//
// The Sequelize models are stubbed, so no database connection is made. A dummy
// DATABASE_URL is set before requiring db.js purely so the Sequelize instance can
// be constructed (Sequelize does not connect until a query runs, which we stub).

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test } = require('node:test');
const assert = require('node:assert');

const Invitation = require('./invitation.model');
const CompanyUser = require('./companyUser.model');
const Company = require('./company.model');
const { sequelize } = require('../../platform/db');
const controller = require('./invitation.controller');

// Minimal call-recording stub (avoids a mocking dependency).
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

test('accept: a non-addressee gets a generic 404 and no collaborator is created', async () => {
    const tx = fakeTx();
    sequelize.transaction = fn(async () => tx);
    Invitation.findByPk = fn(async () => ({ email: 'owner@example.com', status: 'pending' }));
    CompanyUser.findOne = fn(async () => null);
    CompanyUser.create = fn(async () => ({}));

    const req = { params: { id: 'inv-1' }, user: { id: 'attacker', email: 'attacker@evil.com' } };
    const res = mockRes();

    await controller.acceptInvitation(req, res);

    assert.strictEqual(res.statusCode, 404, 'non-addressee must look like "not found"');
    assert.match(res.body.message, /not found or no longer available/i);
    assert.strictEqual(CompanyUser.create.calls.length, 0, 'must NOT create a collaborator');
    assert.strictEqual(tx.rollback.calls.length, 1, 'must roll back the transaction');
});

test('accept: the addressed identity becomes a collaborator with the invited role', async () => {
    const tx = fakeTx();
    sequelize.transaction = fn(async () => tx);
    const invitation = {
        email: 'owner@example.com',
        status: 'pending',
        companyId: 'company-1',
        roleId: 'role-1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        save: fn(async () => {}),
    };
    Invitation.findByPk = fn(async () => invitation);
    CompanyUser.findOne = fn(async () => null);
    CompanyUser.create = fn(async () => ({}));
    Company.findByPk = fn(async () => ({ id: 'company-1', name: 'Company One' }));

    // Email match is case-insensitive — caller's casing differs on purpose.
    const req = { params: { id: 'inv-1' }, user: { id: 'user-1', email: 'Owner@Example.com' } };
    const res = mockRes();

    await controller.acceptInvitation(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(CompanyUser.create.calls.length, 1, 'must create exactly one collaborator');
    const createdWith = CompanyUser.create.calls[0][0];
    assert.deepStrictEqual(
        { userId: createdWith.userId, companyId: createdWith.companyId, roleId: createdWith.roleId },
        { userId: 'user-1', companyId: 'company-1', roleId: 'role-1' },
    );
    assert.strictEqual(invitation.status, 'accepted', 'invitation must be marked accepted');
    assert.strictEqual(tx.commit.calls.length, 1, 'must commit the transaction');
});

test('accept: an expired (but correctly addressed) invitation returns 410 and is not accepted', async () => {
    const tx = fakeTx();
    sequelize.transaction = fn(async () => tx);
    const invitation = {
        email: 'owner@example.com',
        status: 'pending',
        companyId: 'company-1',
        roleId: 'role-1',
        expiresAt: new Date(Date.now() - 1000), // already in the past
        save: fn(async () => {}),
    };
    Invitation.findByPk = fn(async () => invitation);
    CompanyUser.create = fn(async () => ({}));

    const req = { params: { id: 'inv-1' }, user: { id: 'user-1', email: 'owner@example.com' } };
    const res = mockRes();

    await controller.acceptInvitation(req, res);

    assert.strictEqual(res.statusCode, 410);
    assert.strictEqual(invitation.status, 'expired');
    assert.strictEqual(CompanyUser.create.calls.length, 0, 'expired invite must not grant access');
});

test('decline: a non-addressee gets a generic 404 and the invitation is left untouched', async () => {
    const invitation = { email: 'owner@example.com', status: 'pending', save: fn(async () => {}) };
    Invitation.findByPk = fn(async () => invitation);

    const req = { params: { id: 'inv-1' }, user: { id: 'attacker', email: 'attacker@evil.com' } };
    const res = mockRes();

    await controller.declineInvitation(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(invitation.save.calls.length, 0, 'must not modify the invitation');
    assert.strictEqual(invitation.status, 'pending');
});
