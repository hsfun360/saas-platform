const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const eInvoiceClassificationCodeController = require('./eInvoiceClassificationCode.controller');

// Read-only classification-code list for the app's pickers (e-Invoice line
// classification). Any authenticated user, so this is guarded by verifyToken
// only - NOT the System Admin RBAC that gates /api/admin/e-invoice-classification-codes
// maintenance.
router.use(verifyToken);
router.get('/', eInvoiceClassificationCodeController.listActiveEInvoiceClassificationCodes);

module.exports = router;
