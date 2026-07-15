const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const controller = require('./department.controller');

// Read-only department list for pickers (User Management assignment, future
// product screens). Any authenticated workspace user - guarded by verifyToken
// only; maintenance lives under /auth/account/departments (Tenant Admin).
router.use(verifyToken);
router.get('/', controller.listActiveDepartments);

module.exports = router;
