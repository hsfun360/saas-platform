// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const { getPublicKey } = require('./jwt.keys');

exports.verifyToken = (req, res, next) => {
    // 1. Get the token from the Authorization header
    let token = req.headers["authorization"];

    if (!token) {
        return res.status(403).json({ message: "No token provided!" });
    }

    // 2. Strip out the "Bearer " prefix if it exists
    if (token.startsWith('Bearer ')) {
        token = token.slice(7, token.length).trimLeft();
    }

    // 3. Verify the token using your RSA public key
    jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Unauthorized! Token is expired or invalid." });
        }

        // Purpose-scoped tokens (onboarding, mfa step-up, forced mfa
        // enrollment) are only valid on their own endpoints - never on the
        // general API.
        if (decoded.purpose) {
            return res.status(403).json({ message: "Please finish signing in first." });
        }

        // 4. The session behind the token must still be live (2026-11-05): a
        // session ended by a newer sign-in under the account's session limit
        // is signed out on its next request, with the reason. One indexed
        // read; tokens without a sid (older, or portal tokens) are not checked.
        // Identity owns the session table, so the check is its service's
        // (lazy, like the gateways) - the HTTP form when identity splits.
        if (!decoded.sid) {
            req.user = decoded;
            return next();
        }
        const sessions = require('../modules/identity/session.service');
        sessions.sessionIsLive(decoded.sid).then((verdict) => {
            if (!verdict.live) return sessions.endedSessionResponse(res, verdict.reason);
            // 5. Attach the decoded user data (like email and companyId) to the request
            req.user = decoded;
            next(); // Pass control to the next function (e.g., isSystemAdmin)
        }).catch(next);
    });
};