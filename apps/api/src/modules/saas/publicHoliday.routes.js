const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const { validate } = require('../../platform/validate');
const schemas = require('./publicHoliday.schemas');
const controller = require('./publicHoliday.controller');

// Read-only public-holiday list for product calendars (Membership / Golf /
// Facility bookings), resolved to the caller's company country. Any
// authenticated workspace user - guarded by verifyToken only; maintenance lives
// under /auth/account/public-holidays (Tenant Admin). Optional ?year= is
// bounded at the boundary (2026-10-12).
router.use(verifyToken);
router.get('/', validate(schemas.listActive), controller.listActivePublicHolidays);

module.exports = router;
