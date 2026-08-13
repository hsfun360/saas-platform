const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const eInvoiceStateCodeController = require('./eInvoiceStateCode.controller');

// Read-only e-Invoice state-code list for the app's pickers. Any authenticated
// user, so this is guarded by verifyToken only - NOT the System Admin RBAC that
// gates /api/admin/e-invoice-state-codes maintenance.
router.use(verifyToken);
router.get('/', eInvoiceStateCodeController.listActiveEInvoiceStateCodes);

module.exports = router;
