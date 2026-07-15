const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./position.controller');

// Read-only position list for pickers (User Management assignment, future
// product screens). Any authenticated workspace user - guarded by verifyToken
// only; maintenance lives under /auth/account/positions (Tenant Admin).
router.use(verifyToken);
router.get('/', controller.listActivePositions);

module.exports = router;
