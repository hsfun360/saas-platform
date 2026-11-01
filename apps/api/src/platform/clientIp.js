// src/platform/clientIp.js
//
// The real client IP when the request came through the web app's nginx /api
// reverse proxy (dev/staging run the SPA same-origin with the API that way).
//
// Without this, Cloud Run's front end appends the PROXY's egress address as
// the last X-Forwarded-For entry and `app.set('trust proxy', 1)` makes req.ip
// resolve to it - so every browser user shared ONE address in the per-IP rate
// limits, the login backoff, the session/trusted-device records, the audit
// context and the login-failure alert (found 2026-10-30, when a failed login
// probe logged a Google egress IP).
//
// The proxy forwards the browser's address in X-Client-IP together with
// X-Proxy-Token, a shared secret (PROXY_SHARED_TOKEN here, PROXY_TOKEN on the
// web container - one Secret Manager secret per environment). The header is
// believed ONLY when the token matches, so a direct caller of the API host
// cannot spoof its address by sending X-Client-IP - they get the usual
// trust-proxy-1 resolution. Degrades cleanly: no secret configured, or no
// token sent (the future load balancer serves /api itself and sends none),
// means nothing changes.

const crypto = require('crypto');
const net = require('net');

function tokenMatches(presented, expected) {
    if (!presented || !expected) return false;
    const a = Buffer.from(String(presented));
    const b = Buffer.from(String(expected));
    // timingSafeEqual needs equal lengths; a length mismatch is a mismatch.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Pure decision, unit-tested: { ip, source } for a request-like object
// ({ ip, headers }) given the expected shared token.
function resolveClientIp({ ip, headers = {} }, expectedToken) {
    const token = headers['x-proxy-token'];
    const forwarded = headers['x-client-ip'];
    if (expectedToken && tokenMatches(token, expectedToken) && forwarded && net.isIP(String(forwarded).trim())) {
        return { ip: String(forwarded).trim(), source: 'proxy' };
    }
    return { ip, source: 'direct' };
}

// Mount once, right after `app.set('trust proxy', 1)` and before anything
// that reads req.ip (rate limiters, audit context, session records).
function clientIpMiddleware(req, res, next) {
    const resolved = resolveClientIp(
        { ip: req.ip, headers: { 'x-proxy-token': req.get('x-proxy-token'), 'x-client-ip': req.get('x-client-ip') } },
        process.env.PROXY_SHARED_TOKEN,
    );
    if (resolved.source === 'proxy') {
        // Express defines `ip` as a getter on the request prototype; an own
        // property on this request shadows it for every later reader.
        Object.defineProperty(req, 'ip', { value: resolved.ip, configurable: true, enumerable: true });
    }
    req.clientIpSource = resolved.source;
    next();
}

module.exports = { resolveClientIp, clientIpMiddleware };
