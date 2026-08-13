const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const eInvoiceUnitTypeController = require('./eInvoiceUnitType.controller');

// Read-only e-Invoice unit-type list for the app's pickers. Any authenticated
// user, so this is guarded by verifyToken only - NOT the System Admin RBAC that
// gates /api/admin/e-invoice-unit-types maintenance.
router.use(verifyToken);
router.get('/', eInvoiceUnitTypeController.listActiveEInvoiceUnitTypes);

module.exports = router;
