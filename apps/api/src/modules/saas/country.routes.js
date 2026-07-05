const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const countryController = require('./country.controller');

// Read-only country list for the app's pickers. Any authenticated user (tenant
// admins fill in company country, etc.), so this is guarded by verifyToken only -
// NOT the System Admin RBAC that gates /api/admin/countries maintenance.
router.use(verifyToken);
router.get('/', countryController.listActiveCountries);

module.exports = router;
