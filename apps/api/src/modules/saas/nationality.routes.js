const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./nationality.controller');

// Read-only nationality list for product pickers (Membership / Golf / …). Any
// authenticated workspace user - guarded by verifyToken only; maintenance lives
// under /auth/account/nationalities (Tenant Admin).
router.use(verifyToken);
router.get('/', controller.listActiveNationalities);

module.exports = router;
