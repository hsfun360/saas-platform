// src/platform/rateLimits.js
//
// Per-IP rate limits for the PUBLIC (unauthenticated) auth endpoints - the
// blunt outer layer against credential stuffing, email bombing and junk
// registrations. Per-ACCOUNT throttling (capped exponential backoff on failed
// logins) lives in the login flow itself; the two are complementary layers.
//
// The client IP comes from req.ip, which is correct only with
// app.set('trust proxy', 1): Cloud Run's front end appends the real client IP
// as the LAST X-Forwarded-For entry, and trusting exactly one hop makes
// Express read that entry (anything earlier in the header is client-supplied
// junk and ignored).
//
// Limits are per instance (in-memory store). Cloud Run may run several
// instances, so a determined attacker gets N x the limit - still a >100x
// reduction, and the per-account backoff catches what leaks through. A shared
// store (Redis/Memorystore) can slot in later without changing the routes.

const rateLimit = require('express-rate-limit');

// FACTORIES, not shared instances: each route mounts its OWN limiter so the
// buckets never pool across endpoints (a shared instance would mean register +
// forgot-password together burn one 5/hour budget - far too tight for an
// office behind a single NAT IP).
const perIp = (windowMs, limit) => rateLimit({
    windowMs,
    limit,
    standardHeaders: true, // RateLimit-* headers so clients can back off
    legacyHeaders: false,
    // JSON body matching the app's error shape (default is plain text).
    handler: (req, res) => {
        res.status(429).json({ message: 'Too many requests. Please try again later.' });
    },
});

// Login (and SSO exchanges): generous enough for a fumbling human or a small
// office NAT, hostile to a script. 20 attempts / 15 min / IP / endpoint.
const loginLimiter = () => perIp(15 * 60 * 1000, 20);

// Account-creating / email-sending endpoints: nobody legitimately registers
// or requests resets in bulk. 5 / hour / IP / endpoint.
const signupLimiter = () => perIp(60 * 60 * 1000, 5);

// Token-consuming endpoints (verify email, reset/activate with a token):
// small burst room for double-clicks and retries. 20 / hour / IP / endpoint.
const tokenLimiter = () => perIp(60 * 60 * 1000, 20);

// Public read-only config (no secrets, no writes, fetched on every login-page
// visit): roomy so a testing session behind one NAT never trips it, still a
// ceiling against scripted hammering. 100 / 15 min / IP / endpoint.
const publicConfigLimiter = () => perIp(15 * 60 * 1000, 100);

module.exports = { loginLimiter, signupLimiter, tokenLimiter, publicConfigLimiter };
