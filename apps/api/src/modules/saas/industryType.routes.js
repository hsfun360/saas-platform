const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./industryType.controller');

// Read-only industry-type list for product pickers (Membership / Golf / …). Any
// authenticated workspace user - guarded by verifyToken only; maintenance lives
// under /auth/account/industry-types (Tenant Admin).
router.use(verifyToken);
router.get('/', controller.listActiveIndustryTypes);

module.exports = router;
