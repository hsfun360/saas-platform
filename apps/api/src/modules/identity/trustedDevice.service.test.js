// Unit tests for the trusted-device rules (trustedDevice.service): when a
// stored trust still counts under the account's window, the device label shown
// on the Profile card, and the self-service list / revoke paths. The model
// statics are stubbed; nothing touches a DB.
//
// Runs on Node's built-in test runner (no external deps):  node --test

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/testdb';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const TrustedDevice = require('./trustedDevice.model');
const svc = require('./trustedDevice.service');

const DAY = 24 * 60 * 60 * 1000;
const sha = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function fn(impl) {
    const f = (...args) => { f.calls.push(args); return impl ? impl(...args) : undefined; };
    f.calls = [];
    return f;
}

function fakeRes() {
    const res = { cookies: [], cleared: [] };
    res.cookie = (name, value, opts) => res.cookies.push({ name, value, opts });
    res.clearCookie = (name, opts) => res.cleared.push({ name, opts });
    return res;
}

// ---- describeUserAgent: the label on the Profile card ----

test('describeUserAgent names the browser and the device, in the right precedence', () => {
    const cases = [
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Chrome on Windows'],
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Edge on Windows'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
        ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Chrome on Android'],
        ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Mac'],
        ['Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 'Samsung Internet on Android'],
        ['', 'Unknown device'],
        [null, 'Unknown device'],
    ];
    for (const [ua, expected] of cases) assert.strictEqual(svc.describeUserAgent(ua), expected, ua);
});

// ---- trustIsLive: the login-gate decision for one row ----

test('a live row counts only for its user, unrevoked, unexpired, and inside the current window', () => {
    const now = Date.parse('2026-11-01T08:00:00Z');
    const row = { userId: 'u-1', createdAt: new Date(now - 10 * DAY), expiresAt: new Date(now + 20 * DAY), revokedAt: null };
    assert.strictEqual(svc.trustIsLive(row, { userId: 'u-1', now }), true);
    assert.strictEqual(svc.trustIsLive(row, { userId: 'u-2', now }), false, 'another user');
    assert.strictEqual(svc.trustIsLive({ ...row, revokedAt: new Date(now - DAY) }, { userId: 'u-1', now }), false, 'revoked');
    assert.strictEqual(svc.trustIsLive({ ...row, expiresAt: new Date(now) }, { userId: 'u-1', now }), false, 'expired at this instant');
    assert.strictEqual(svc.trustIsLive(null, { userId: 'u-1', now }), false, 'no row');
    // The account shortened its window after the row was issued under 30 days.
    assert.strictEqual(svc.trustIsLive(row, { userId: 'u-1', now, maxAgeDays: 7 }), false, '10 days old, 7-day window');
    assert.strictEqual(svc.trustIsLive(row, { userId: 'u-1', now, maxAgeDays: 10 }), false, 'exactly at the window edge');
    assert.strictEqual(svc.trustIsLive(row, { userId: 'u-1', now, maxAgeDays: 11 }), true, 'inside an 11-day window');
    assert.strictEqual(svc.trustIsLive(row, { userId: 'u-1', now, maxAgeDays: 30 }), true, 'the platform default');
});

test('hasValidTrust reads the td cookie, matches by hash, stamps lastUsedAt, and skips the lookup without a cookie', async () => {
    const row = { userId: 'u-1', tokenHash: sha('raw-1'), createdAt: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + DAY), revokedAt: null, lastUsedAt: null, save: fn(async () => {}) };
    TrustedDevice.findOne = fn(async () => row);
    assert.strictEqual(await svc.hasValidTrust({ cookies: { td: 'raw-1' } }, 'u-1'), true);
    assert.deepStrictEqual(TrustedDevice.findOne.calls[0][0], { where: { tokenHash: sha('raw-1') } });
    assert.ok(row.lastUsedAt instanceof Date);
    assert.strictEqual(row.save.calls.length, 1);

    assert.strictEqual(await svc.hasValidTrust({ cookies: { td: 'raw-1' } }, 'u-2'), false, 'another user');
    assert.strictEqual(await svc.hasValidTrust({ cookies: { td: 'raw-1' } }, 'u-1', { maxAgeDays: 1 }), false, 'outside a 1-day window');

    TrustedDevice.findOne = fn(async () => row);
    assert.strictEqual(await svc.hasValidTrust({ cookies: {} }, 'u-1'), false);
    assert.strictEqual(TrustedDevice.findOne.calls.length, 0, 'no cookie = no query');
});

// ---- issueTrust: the account's window sets both the row and the cookie ----

test('issueTrust stores the hash for the account window and sets a matching cookie', async () => {
    TrustedDevice.create = fn(async (values) => ({ id: 'row-1', ...values }));
    const res = fakeRes();
    const req = { headers: { 'user-agent': 'UA' }, ip: '1.2.3.4' };
    const before = Date.now();
    const row = await svc.issueTrust(res, { userId: 'u-1', req, ttlDays: 7 });
    assert.strictEqual(row.userId, 'u-1');
    assert.strictEqual(row.userAgent, 'UA');
    assert.strictEqual(row.ip, '1.2.3.4');
    const ttl = row.expiresAt.getTime() - before;
    assert.ok(ttl >= 7 * DAY - 5000 && ttl <= 7 * DAY + 5000, `expires in ~7 days, got ${ttl}`);
    assert.strictEqual(res.cookies.length, 1);
    const c = res.cookies[0];
    assert.strictEqual(c.name, 'td');
    assert.strictEqual(sha(c.value), row.tokenHash, 'the row stores the SHA-256 of the cookie value');
    assert.strictEqual(c.opts.maxAge, 7 * DAY);
    assert.strictEqual(c.opts.httpOnly, true);
    assert.strictEqual(c.opts.path, '/api/auth');

    const def = await svc.issueTrust(fakeRes(), { userId: 'u-1', req });
    const defTtl = def.expiresAt.getTime() - Date.now();
    assert.ok(defTtl > 29 * DAY && defTtl <= 30 * DAY, 'the default window is 30 days');
});

// ---- listTrust / revokeTrust / revokeAllTrust: the Profile card ----

test('listTrust returns the live rows newest first and marks the requesting browser as current', async () => {
    const rows = [
        { id: 'a', userId: 'u-1', tokenHash: sha('other'), userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1', createdAt: new Date('2026-10-30T00:00:00Z'), expiresAt: new Date('2026-11-29T00:00:00Z'), lastUsedAt: null, ip: '9.9.9.9' },
        { id: 'b', userId: 'u-1', tokenHash: sha('mine'), userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36', createdAt: new Date('2026-10-01T00:00:00Z'), expiresAt: new Date('2026-10-31T00:00:00Z'), lastUsedAt: new Date('2026-10-20T00:00:00Z'), ip: '1.1.1.1' },
    ];
    TrustedDevice.findAll = fn(async () => rows);
    const out = await svc.listTrust('u-1', { cookies: { td: 'mine' } });
    const q = TrustedDevice.findAll.calls[0][0];
    assert.strictEqual(q.where.userId, 'u-1');
    assert.strictEqual(q.where.revokedAt, null);
    assert.deepStrictEqual(q.order, [['createdAt', 'DESC']]);
    assert.deepStrictEqual(out.map((d) => [d.id, d.device, d.current, d.ip]), [
        ['a', 'Safari on iPhone', false, '9.9.9.9'],
        ['b', 'Chrome on Windows', true, '1.1.1.1'],
    ]);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(out[0], 'tokenHash'), false, 'the hash never leaves the server');
});

test('revokeTrust revokes only the caller\'s own live row and clears the cookie when it is this browser', async () => {
    const row = { id: 'b', userId: 'u-1', tokenHash: sha('mine'), revokedAt: null, save: fn(async () => {}) };
    TrustedDevice.findOne = fn(async ({ where }) => (where.id === 'b' && where.userId === 'u-1' ? row : null));
    const res = fakeRes();
    assert.strictEqual(await svc.revokeTrust('u-1', 'b', { req: { cookies: { td: 'mine' } }, res }), true);
    assert.ok(row.revokedAt instanceof Date);
    assert.strictEqual(res.cleared.length, 1);
    assert.strictEqual(res.cleared[0].name, 'td');
    assert.strictEqual(res.cleared[0].opts.path, '/api/auth');
    assert.strictEqual('maxAge' in res.cleared[0].opts, false, 'clearCookie sets its own expiry');

    assert.strictEqual(await svc.revokeTrust('u-1', 'b', { req: { cookies: {} }, res: fakeRes() }), false, 'already revoked');
    assert.strictEqual(await svc.revokeTrust('u-2', 'b', { req: { cookies: {} }, res: fakeRes() }), false, 'not this user\'s row');

    const other = { id: 'a', userId: 'u-1', tokenHash: sha('other'), revokedAt: null, save: async () => {} };
    TrustedDevice.findOne = fn(async () => other);
    const res2 = fakeRes();
    assert.strictEqual(await svc.revokeTrust('u-1', 'a', { req: { cookies: { td: 'mine' } }, res: res2 }), true);
    assert.strictEqual(res2.cleared.length, 0, 'another device: this browser keeps its cookie');
});

test('revokeAllTrust revokes every live row, reports the count, and clears a presented cookie', async () => {
    TrustedDevice.update = fn(async () => [3]);
    const res = fakeRes();
    assert.strictEqual(await svc.revokeAllTrust('u-1', { req: { cookies: { td: 'mine' } }, res }), 3);
    assert.deepStrictEqual(TrustedDevice.update.calls[0][1], { where: { userId: 'u-1', revokedAt: null } });
    assert.strictEqual(res.cleared.length, 1);

    TrustedDevice.update = fn(async () => [0]);
    const res2 = fakeRes();
    assert.strictEqual(await svc.revokeAllTrust('u-1', { req: { cookies: {} }, res: res2 }), 0);
    assert.strictEqual(res2.cleared.length, 0);
    // The legacy callers (MFA disable, admin reset, password change) pass only the user id.
    assert.strictEqual(await svc.revokeAllTrust('u-1'), 0);
});
