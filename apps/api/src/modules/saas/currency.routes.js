const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const currencyController = require('./currency.controller');

// Read-only currency list for the app's pickers. Any authenticated user, so this
// is guarded by verifyToken only - NOT the System Admin RBAC that gates
// /api/admin/currencies maintenance.
router.use(verifyToken);
router.get('/', currencyController.listActiveCurrencies);

module.exports = router;
