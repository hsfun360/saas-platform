const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./publicHoliday.controller');

// Read-only public-holiday list for product calendars (Membership / Golf /
// Facility bookings), resolved to the caller's company country. Any
// authenticated workspace user - guarded by verifyToken only; maintenance lives
// under /auth/account/public-holidays (Tenant Admin).
router.use(verifyToken);
router.get('/', controller.listActivePublicHolidays);

module.exports = router;
