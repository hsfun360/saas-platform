const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const eInvoiceTaxTypeController = require('./eInvoiceTaxType.controller');

// Read-only e-Invoice tax-type list for the app's pickers. Any authenticated
// user, so this is guarded by verifyToken only - NOT the System Admin RBAC that
// gates /api/admin/e-invoice-tax-types maintenance.
router.use(verifyToken);
router.get('/', eInvoiceTaxTypeController.listActiveEInvoiceTaxTypes);

module.exports = router;
