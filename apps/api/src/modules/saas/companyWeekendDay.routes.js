const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./companyWeekendDay.controller');

// Read-only weekend-day set for the caller's company, for weekday/weekend
// pricing matrices (golf green fees etc.). Any authenticated workspace user -
// guarded by verifyToken only; maintenance lives under
// /auth/companies/:companyId/weekend-days (Tenant Admin, Companies screen).
router.use(verifyToken);
router.get('/', controller.listMyWeekendDays);

module.exports = router;
