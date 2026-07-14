const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./race.controller');

// Read-only race list for product pickers (Membership / …). Any authenticated
// workspace user - guarded by verifyToken only; maintenance lives under
// /auth/account/races (Tenant Admin).
router.use(verifyToken);
router.get('/', controller.listActiveRaces);

module.exports = router;
