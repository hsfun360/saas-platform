const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./salutation.controller');

// Read-only salutation list for product pickers (Membership / Golf / …). Any
// authenticated workspace user - guarded by verifyToken only; maintenance lives
// under /auth/account/salutations (Tenant Admin).
router.use(verifyToken);
router.get('/', controller.listActiveSalutations);

module.exports = router;
