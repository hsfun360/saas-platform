// src/platform/auditContext.js
//
// WHO-context for the audit trail, carried on AsyncLocalStorage so the global
// Sequelize hooks (auditHooks.js) can attribute any DB change to the request
// that caused it without threading parameters through every controller.
//
// The middleware VERIFIES the bearer token (public key) before trusting its
// claims - a forged token must not be able to plant a false identity in the
// trail. A missing/invalid token simply yields an anonymous context (ip +
// requestId still recorded); purpose-scoped tokens (onboarding/mfa) attribute
// to their user like any other.

const { AsyncLocalStorage } = require('async_hooks');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getPublicKey } = require('./jwt.keys');

const als = new AsyncLocalStorage();

// Express middleware - mount ONCE, before the routes.
function auditContextMiddleware(req, res, next) {
    const store = {
        userId: null,
        userEmail: null,
        companyId: null,
        ip: String(req.ip || '').slice(0, 64) || null,
        requestId: uuidv4(),
    };

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const claims = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] });
            store.userId = claims.id || null;
            store.userEmail = claims.email || null;
            store.companyId = claims.companyId || null;
        } catch (e) {
            // Unverifiable token -> anonymous attribution (auth middleware will
            // reject the request itself where it matters).
        }
    }

    als.run(store, next);
}

// The current request's context, or null outside a request (boot, worker).
function currentAuditContext() {
    return als.getStore() || null;
}

module.exports = { auditContextMiddleware, currentAuditContext };
