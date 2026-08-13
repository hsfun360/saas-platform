const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const eInvoiceMsicCodeController = require('./eInvoiceMsicCode.controller');

// Read-only e-Invoice MSIC code list for the app's pickers (e-Invoice business nature /
// activity). Any authenticated user, so this is guarded by verifyToken only -
// NOT the System Admin RBAC that gates /api/admin/e-invoice-msic-codes maintenance.
router.use(verifyToken);
router.get('/', eInvoiceMsicCodeController.listActiveEInvoiceMsicCodes);

module.exports = router;
