// Unit tests for the refresh-session rules that the concurrent-session limit
// rests on (session.service): which live sessions a new sign-in ends, how a
// family's activity is derived, what the liveness check answers, and the
// shape of the "your session ended" 401. The model is stubbed; no DB.
//
// Runs on Node's built-in test runner (no external deps):  node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const RefreshToken = require('./refreshToken.model');
const sessions = require('./session.service');

function fn(impl) {
    const f = (...args) => { f.calls.push(args); return impl ? impl(...args) : undefined; };
    f.calls = [];
    return f;
}

const T0 = new Date('2026-11-05T08:00:00.000Z');
const minutes = (n) => new Date(T0.getTime() + n * 60 * 1000);

// ---- groupFamilies / familiesToEnd: the pure rules ----

test('rows collapse to one entry per family, idlest first, with the newest row\'s device and address', () => {
    const families = sessions.groupFamilies([
        { familyId: 'A', companyId: 'c-1', createdAt: minutes(0), lastSeenAt: minutes(0), userAgent: 'old-A', ip: '1.1.1.1' },
        { familyId: 'B', companyId: 'c-1', createdAt: minutes(5), lastSeenAt: minutes(5), userAgent: 'B', ip: '2.2.2.2' },
        // A refreshed later: its activity, device and address follow the newest row.
        { familyId: 'A', companyId: 'c-1', createdAt: minutes(30), lastSeenAt: minutes(30), userAgent: 'new-A', ip: '3.3.3.3' },
        // A row without lastSeenAt (pre-2026-11-05) falls back to createdAt.
        { familyId: 'C', companyId: 'c-2', createdAt: minutes(10), lastSeenAt: null, userAgent: 'C', ip: null },
    ]);
    assert.deepStrictEqual(families.map((f) => f.familyId), ['B', 'C', 'A']);
    const a = families.find((f) => f.familyId === 'A');
    assert.strictEqual(a.userAgent, 'new-A');
    assert.strictEqual(a.ip, '3.3.3.3');
    assert.strictEqual(a.signedInAt.getTime(), minutes(0).getTime(), 'signed in = the family\'s first row');
    assert.strictEqual(a.lastSeenAt.getTime(), minutes(30).getTime());
});

test('a limit of one ends every existing session; a higher limit keeps the newest ones', () => {
    const live = [{ familyId: 'idle' }, { familyId: 'mid' }, { familyId: 'busy' }]; // idlest first
    assert.deepStrictEqual(sessions.familiesToEnd(live, 1).map((f) => f.familyId), ['idle', 'mid', 'busy']);
    assert.deepStrictEqual(sessions.familiesToEnd(live, 2).map((f) => f.familyId), ['idle', 'mid']);
    assert.deepStrictEqual(sessions.familiesToEnd(live, 3).map((f) => f.familyId), ['idle']);
    assert.deepStrictEqual(sessions.familiesToEnd(live, 4), []);
    assert.deepStrictEqual(sessions.familiesToEnd([], 1), []);
});

// ---- issueSession: the limit ends the idlest families, stamped with the new one ----

beforeEach(() => {
    RefreshToken.findAll = fn(async () => []);
    RefreshToken.update = fn(async () => [0]);
    RefreshToken.create = fn(async (values) => ({ ...values, id: 'row-new', createdAt: new Date() }));
});

function fakeRes() {
    const res = { cookies: [], headers: {}, statusCode: 200, body: null };
    res.cookie = (name, value, opts) => { res.cookies.push({ name, value, opts }); return res; };
    res.clearCookie = (name, opts) => { res.cookies.push({ name, cleared: true, opts }); return res; };
    res.set = (k, v) => { res.headers[k] = v; return res; };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
}

test('a sign-in under a limit of one ends the live tenant sessions and reports them', async () => {
    RefreshToken.findAll = fn(async () => [
        { familyId: 'phone', companyId: 'c-1', createdAt: minutes(0), lastSeenAt: minutes(40), userAgent: 'iPhone', ip: '9.9.9.9' },
        { familyId: 'pc', companyId: 'c-1', createdAt: minutes(10), lastSeenAt: minutes(20), userAgent: 'Windows', ip: '8.8.8.8' },
    ]);
    RefreshToken.update = fn(async () => [3]);
    const res = fakeRes();

    const { row, superseded } = await sessions.issueSession(res, { userId: 'u-1', companyId: 'c-1', rememberMe: false, req: null, limit: { max: 1 } });

    assert.deepStrictEqual(superseded.map((f) => f.familyId), ['pc', 'phone'], 'idlest first, all of them');
    // Only live tenant families were looked at.
    const where = RefreshToken.findAll.calls[0][0].where;
    assert.strictEqual(where.userId, 'u-1');
    assert.strictEqual(where.revokedAt, null);
    assert.ok(where.companyId, 'platform sessions (NULL companyId) are not counted');
    // The ended families are revoked and stamped with the NEW family's id.
    const [values, opts] = RefreshToken.update.calls[0];
    assert.strictEqual(values.supersededByFamilyId, row.familyId);
    assert.ok(values.revokedAt instanceof Date);
    assert.strictEqual(opts.where.revokedAt, null);
    const ids = opts.where.familyId[Object.getOwnPropertySymbols(opts.where.familyId)[0]];
    assert.deepStrictEqual([...ids].sort(), ['pc', 'phone']);
    // The new session is created with its activity stamped and the cookie set.
    assert.strictEqual(RefreshToken.create.calls[0][0].familyId, row.familyId);
    assert.ok(RefreshToken.create.calls[0][0].lastSeenAt instanceof Date);
    assert.strictEqual(res.cookies[0].name, 'rt');
});

test('with a limit of two only the idlest session ends; with no limit nothing is read or ended', async () => {
    RefreshToken.findAll = fn(async () => [
        { familyId: 'phone', companyId: 'c-1', createdAt: minutes(0), lastSeenAt: minutes(40), userAgent: 'iPhone', ip: null },
        { familyId: 'pc', companyId: 'c-1', createdAt: minutes(10), lastSeenAt: minutes(20), userAgent: 'Windows', ip: null },
    ]);
    const two = await sessions.issueSession(fakeRes(), { userId: 'u-1', companyId: 'c-1', req: null, limit: { max: 2 } });
    assert.deepStrictEqual(two.superseded.map((f) => f.familyId), ['pc']);

    RefreshToken.findAll = fn(async () => { throw new Error('must not be called'); });
    RefreshToken.update = fn(async () => { throw new Error('must not be called'); });
    const none = await sessions.issueSession(fakeRes(), { userId: 'u-1', companyId: 'c-1', req: null, limit: null });
    assert.deepStrictEqual(none.superseded, []);
    // A platform (System Administration) sign-in is never limited either.
    const platform = await sessions.issueSession(fakeRes(), { userId: 'u-1', companyId: null, req: null, limit: { max: 1 } });
    assert.deepStrictEqual(platform.superseded, []);
});

// ---- sessionIsLive: the per-request check behind the sid claim ----

test('liveness follows the family\'s newest row and names why it ended', async () => {
    assert.deepStrictEqual(await sessions.sessionIsLive(null), { live: true }, 'no sid (older or portal token) = not checked');

    RefreshToken.findOne = fn(async () => ({ revokedAt: null, supersededByFamilyId: null }));
    assert.deepStrictEqual(await sessions.sessionIsLive('fam-1'), { live: true });
    assert.deepStrictEqual(RefreshToken.findOne.calls[0][0].where, { familyId: 'fam-1' });
    assert.deepStrictEqual(RefreshToken.findOne.calls[0][0].order, [['createdAt', 'DESC']]);

    RefreshToken.findOne = fn(async () => ({ revokedAt: new Date(), supersededByFamilyId: 'fam-2' }));
    assert.deepStrictEqual(await sessions.sessionIsLive('fam-1'), { live: false, reason: 'session_superseded' });

    RefreshToken.findOne = fn(async () => ({ revokedAt: new Date(), supersededByFamilyId: null }));
    assert.deepStrictEqual(await sessions.sessionIsLive('fam-1'), { live: false, reason: 'session_ended' });

    RefreshToken.findOne = fn(async () => null);
    assert.deepStrictEqual(await sessions.sessionIsLive('gone'), { live: false, reason: 'session_ended' });
});

test('the ended-session 401 carries the reason, clears the refresh cookie and asks the browser to clear its storage', () => {
    const res = fakeRes();
    sessions.endedSessionResponse(res, 'session_superseded');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.reason, 'session_superseded');
    assert.match(res.body.message, /signed in on another device/);
    assert.strictEqual(res.headers['Clear-Site-Data'], '"cache", "storage"', 'cookies are NOT cleared wholesale (trust cookies survive)');
    assert.deepStrictEqual(res.cookies.map((c) => [c.name, c.cleared]), [['rt', true]]);

    const other = fakeRes();
    sessions.endedSessionResponse(other, 'something-else');
    assert.strictEqual(other.body.reason, 'session_ended', 'an unknown reason reads as a plain ending');
});

// ---- rotateSession: a superseded family says so on refresh ----

test('refreshing a superseded session answers the reason instead of a row', async () => {
    const req = { cookies: { rt: 'raw' }, headers: {}, ip: '1.2.3.4' };
    RefreshToken.findOne = fn(async () => ({ revokedAt: new Date(), supersededByFamilyId: 'fam-2', expiresAt: minutes(60), rotatedAt: null }));
    assert.deepStrictEqual(await sessions.rotateSession(req, fakeRes()), { row: null, reason: 'session_superseded' });

    RefreshToken.findOne = fn(async () => ({ revokedAt: new Date(), supersededByFamilyId: null, expiresAt: minutes(60), rotatedAt: null }));
    assert.deepStrictEqual(await sessions.rotateSession(req, fakeRes()), { row: null, reason: 'session_ended' });

    assert.deepStrictEqual(await sessions.rotateSession({ cookies: {}, headers: {} }, fakeRes()), { row: null, reason: 'session_ended' });
});

test('a successful rotation stamps the fresh row\'s activity and keeps the family', async () => {
    const req = { cookies: { rt: 'raw' }, headers: { 'user-agent': 'Chrome' }, ip: '1.2.3.4' };
    const row = { userId: 'u-1', companyId: 'c-1', familyId: 'fam-1', revokedAt: null, rotatedAt: null, expiresAt: new Date(Date.now() + 60 * 60 * 1000), save: fn(async () => {}) };
    RefreshToken.findOne = fn(async () => row);
    const res = fakeRes();

    const out = await sessions.rotateSession(req, res);

    assert.strictEqual(out.row.familyId, 'fam-1');
    assert.ok(RefreshToken.create.calls[0][0].lastSeenAt instanceof Date);
    assert.ok(row.rotatedAt instanceof Date);
    assert.strictEqual(res.cookies[0].name, 'rt');
});

// ---- revokeFamily / revokeOtherSessions: the Profile's sign-out actions ----

test('a user may end one of their other sessions but never the one they are using', async () => {
    RefreshToken.update = fn(async () => [1]);
    assert.strictEqual(await sessions.revokeFamily('u-1', 'other', { exceptFamilyId: 'mine' }), true);
    assert.deepStrictEqual(RefreshToken.update.calls[0][1].where, { userId: 'u-1', familyId: 'other', revokedAt: null });
    assert.strictEqual(await sessions.revokeFamily('u-1', 'mine', { exceptFamilyId: 'mine' }), false);
    assert.strictEqual(RefreshToken.update.calls.length, 1, 'the own session is refused without a write');
});

test('sign out everywhere else ends every other live family, platform sessions included', async () => {
    RefreshToken.findAll = fn(async () => [
        { familyId: 'mine', companyId: 'c-1', createdAt: minutes(0), lastSeenAt: minutes(50), userAgent: 'a', ip: null },
        { familyId: 'pc', companyId: 'c-1', createdAt: minutes(1), lastSeenAt: minutes(10), userAgent: 'b', ip: null },
        { familyId: 'platform', companyId: null, createdAt: minutes(2), lastSeenAt: minutes(20), userAgent: 'c', ip: null },
    ]);
    RefreshToken.update = fn(async () => [2]);
    assert.strictEqual(await sessions.revokeOtherSessions('u-1', 'mine'), 2);
    const where = RefreshToken.findAll.calls[0][0].where;
    assert.strictEqual(where.companyId, undefined, 'the Profile list and this action see platform sessions too');
    const ids = RefreshToken.update.calls[0][1].where.familyId[Object.getOwnPropertySymbols(RefreshToken.update.calls[0][1].where.familyId)[0]];
    assert.deepStrictEqual([...ids].sort(), ['pc', 'platform']);
});
