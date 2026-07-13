const express = require('express');
const router = express.Router();
const controller = require('./membershipTax.controller');

// Mounted at /api/membership/tax. The parent membership router already applies
// verifyToken + requireModule('Membership Management'), so these read-only handlers
// just consume the Tax service (through the gateway seam) for the active company.
router.get('/schemes', controller.listSchemes);
router.get('/schemes/:code', controller.resolveScheme);
router.post('/quote', controller.quote);

module.exports = router;
