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
const Account = require('./account.model');
const User = require('../identity/user.model');
const OutboxMessage = require('../../platform/outboxMessage.model');
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

// --- createInvitation: generic response must not disclose user existence ---

// Admin invites from company-A (account acct-X).
const INVITE_REQ = (email) => ({ user: { id: 'admin-1', companyId: 'company-A', email: 'admin@acme.test' }, body: { email } });

function setupInviteHappyPath() {
    const tx = fakeTx();
    sequelize.transaction = fn(async () => tx);
    // Company.findByPk serves both resolveAccountId (accountId) and the email payload (name).
    Company.findByPk = fn(async () => ({ id: 'company-A', accountId: 'acct-X', name: 'Acme Co' }));
    // admin-1 owns account acct-X (account SuperUser → administers company-A).
    Account.findByPk = fn(async () => ({ id: 'acct-X', subscriberName: 'Acme Subscriber', ownerUserId: 'admin-1' }));
    User.findOne = fn(async () => null);          // unknown email by default
    CompanyUser.findOne = fn(async () => null);   // not already a collaborator here
    Invitation.findOne = fn(async () => null);    // no pending invite
    Invitation.create = fn(async () => ({}));
    OutboxMessage.create = fn(async () => ({}));
    return tx;
}

test('invite: an unknown email gets a generic "sent" response, queuing an invitation + email', async () => {
    const tx = setupInviteHappyPath();
    const res = mockRes();

    await controller.createInvitation(INVITE_REQ('consultant@outside.test'), res);

    assert.strictEqual(res.statusCode, 201);
    assert.match(res.body.message, /invitation sent/i);
    assert.strictEqual(Invitation.create.calls.length, 1, 'must create the invitation');
    assert.strictEqual(OutboxMessage.create.calls.length, 1, 'must queue the email');
    assert.strictEqual(tx.commit.calls.length, 1);
});

test('invite: an existing user from another account gets the SAME generic response (no existence leak)', async () => {
    const tx = setupInviteHappyPath();
    User.findOne = fn(async () => ({ id: 'u-ext' }));   // exists globally...
    CompanyUser.findOne = fn(async () => null);          // ...but not a collaborator here

    const res = mockRes();
    await controller.createInvitation(INVITE_REQ('known@elsewhere.test'), res);

    assert.strictEqual(res.statusCode, 201, 'existing-elsewhere must look identical to unknown');
    assert.match(res.body.message, /invitation sent/i);
    assert.strictEqual(Invitation.create.calls.length, 1);
});

test('invite: someone already a collaborator on THIS company is rejected (409), nothing queued', async () => {
    const tx = setupInviteHappyPath();
    User.findOne = fn(async () => ({ id: 'u-in' }));
    CompanyUser.findOne = fn(async () => ({ id: 'existing-link' })); // already a collaborator here

    const res = mockRes();
    await controller.createInvitation(INVITE_REQ('colleague@acme.test'), res);

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(Invitation.create.calls.length, 0, 'must not create an invitation');
    assert.strictEqual(OutboxMessage.create.calls.length, 0, 'must not queue an email');
    assert.strictEqual(tx.rollback.calls.length, 1);
});

test('invite: a duplicate pending invitation is rejected (409)', async () => {
    const tx = setupInviteHappyPath();
    Invitation.findOne = fn(async () => ({ id: 'pending-1' })); // an invite is already pending

    const res = mockRes();
    await controller.createInvitation(INVITE_REQ('consultant@outside.test'), res);

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(Invitation.create.calls.length, 0);
    assert.strictEqual(tx.rollback.calls.length, 1);
});
