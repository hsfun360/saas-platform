const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const { validate } = require('../../platform/validate');
const schemas = require('./title.schemas');
const controller = require('./title.controller');

// Read-only title list for product pickers (Membership / ...). Any authenticated
// workspace user - guarded by verifyToken only; maintenance lives under
// /auth/account/titles (Tenant Admin). Optional ?countryCode= filters to
// universal + that country's titles (bounded at the boundary, 2026-10-12).
router.use(verifyToken);
router.get('/', validate(schemas.listActive), controller.listActiveTitles);

module.exports = router;
