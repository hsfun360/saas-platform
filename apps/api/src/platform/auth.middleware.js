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

        // An onboarding-scoped token (verified user, no workspace yet) is only
        // valid on /api/auth/onboarding/* - never on the general API.
        if (decoded.purpose === 'onboarding') {
            return res.status(403).json({ message: "Please finish creating your organization first." });
        }

        // 4. Attach the decoded user data (like email and companyId) to the request
        req.user = decoded;
        next(); // Pass control to the next function (e.g., isSystemAdmin)
    });
};