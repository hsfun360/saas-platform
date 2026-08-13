const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const eInvoiceDocumentTypeController = require('./eInvoiceDocumentType.controller');

// Read-only e-Invoice document-type list for the app's pickers. Any authenticated
// user, so this is guarded by verifyToken only - NOT the System Admin RBAC that
// gates /api/admin/e-invoice-document-types maintenance.
router.use(verifyToken);
router.get('/', eInvoiceDocumentTypeController.listActiveEInvoiceDocumentTypes);

module.exports = router;
