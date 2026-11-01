// Unit tests for the proxied client-IP resolution (platform/clientIp.js): the
// X-Client-IP header is believed only with the matching shared token, and a
// direct caller can never spoof their address.
//
// Runs on Node's built-in test runner (no external deps):  node --test

const { test } = require('node:test');
const assert = require('node:assert');
const { resolveClientIp, clientIpMiddleware } = require('./clientIp');

const SECRET = 'proxy-secret-2026';

test('a direct call keeps the trust-proxy address', () => {
    assert.deepStrictEqual(resolveClientIp({ ip: '203.0.113.9', headers: {} }, SECRET), { ip: '203.0.113.9', source: 'direct' });
});

test('a proxied call with the right token takes the forwarded address', () => {
    const r = resolveClientIp({ ip: '34.96.53.12', headers: { 'x-proxy-token': SECRET, 'x-client-ip': ' 198.51.100.7 ' } }, SECRET);
    assert.deepStrictEqual(r, { ip: '198.51.100.7', source: 'proxy' });
});

test('IPv6 forwarded addresses are accepted', () => {
    const r = resolveClientIp({ ip: '34.96.53.12', headers: { 'x-proxy-token': SECRET, 'x-client-ip': '2001:db8::1' } }, SECRET);
    assert.deepStrictEqual(r, { ip: '2001:db8::1', source: 'proxy' });
});

test('a wrong, missing or differently-sized token is ignored (no spoofing)', () => {
    for (const bad of ['wrong-secret-2026', 'proxy-secret-2025', '', undefined, 'proxy-secret-2026-but-longer']) {
        const r = resolveClientIp({ ip: '34.96.53.12', headers: { 'x-proxy-token': bad, 'x-client-ip': '198.51.100.7' } }, SECRET);
        assert.deepStrictEqual(r, { ip: '34.96.53.12', source: 'direct' }, `token ${JSON.stringify(bad)}`);
    }
});

test('no secret configured on the API means the header is never believed', () => {
    const r = resolveClientIp({ ip: '34.96.53.12', headers: { 'x-proxy-token': SECRET, 'x-client-ip': '198.51.100.7' } }, undefined);
    assert.deepStrictEqual(r, { ip: '34.96.53.12', source: 'direct' });
});

test('a forwarded value that is not an IP is ignored', () => {
    for (const junk of ['localhost', '198.51.100.7, 10.0.0.1', '<script>', '999.1.1.1']) {
        const r = resolveClientIp({ ip: '34.96.53.12', headers: { 'x-proxy-token': SECRET, 'x-client-ip': junk } }, SECRET);
        assert.strictEqual(r.source, 'direct', junk);
    }
});

test('the middleware shadows req.ip for later readers and tags the source', () => {
    process.env.PROXY_SHARED_TOKEN = SECRET;
    const headers = { 'x-proxy-token': SECRET, 'x-client-ip': '198.51.100.7' };
    // A request whose `ip` is a prototype getter, like Express's.
    const proto = { get(name) { return headers[name.toLowerCase()]; } };
    Object.defineProperty(proto, 'ip', { get: () => '34.96.53.12', configurable: true });
    const req = Object.create(proto);
    let nexted = false;
    clientIpMiddleware(req, {}, () => { nexted = true; });
    assert.strictEqual(nexted, true);
    assert.strictEqual(req.ip, '198.51.100.7');
    assert.strictEqual(req.clientIpSource, 'proxy');

    const direct = Object.create(proto);
    headers['x-proxy-token'] = 'nope';
    clientIpMiddleware(direct, {}, () => {});
    assert.strictEqual(direct.ip, '34.96.53.12');
    assert.strictEqual(direct.clientIpSource, 'direct');
    delete process.env.PROXY_SHARED_TOKEN;
});
