const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const msicCodeController = require('./msicCode.controller');

// Read-only MSIC code list for the app's pickers (e-Invoice business nature /
// activity). Any authenticated user, so this is guarded by verifyToken only -
// NOT the System Admin RBAC that gates /api/admin/msic-codes maintenance.
router.use(verifyToken);
router.get('/', msicCodeController.listActiveMsicCodes);

module.exports = router;
