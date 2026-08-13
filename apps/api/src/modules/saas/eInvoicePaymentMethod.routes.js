const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const eInvoicePaymentMethodController = require('./eInvoicePaymentMethod.controller');

// Read-only e-Invoice payment-method list for the app's pickers. Any authenticated
// user, so this is guarded by verifyToken only - NOT the System Admin RBAC that
// gates /api/admin/e-invoice-payment-methods maintenance.
router.use(verifyToken);
router.get('/', eInvoicePaymentMethodController.listActiveEInvoicePaymentMethods);

module.exports = router;
