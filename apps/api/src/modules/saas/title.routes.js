const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./title.controller');

// Read-only title list for product pickers (Membership / …). Any authenticated
// workspace user - guarded by verifyToken only; maintenance lives under
// /auth/account/titles (Tenant Admin). Optional ?countryCode= filters to
// universal + that country's titles.
router.use(verifyToken);
router.get('/', controller.listActiveTitles);

module.exports = router;
