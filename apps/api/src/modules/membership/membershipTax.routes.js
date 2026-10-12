const express = require('express');
const router = express.Router();
const controller = require('./membershipTax.controller');
const { validate } = require('../../platform/validate');
const s = require('./membershipTax.schemas');

// Mounted at /api/membership/tax. The parent membership router already applies
// verifyToken + requireModule('MEMBERSHIP'), so these read-only handlers
// just consume the Tax service (through the gateway seam) for the active company.
router.get('/schemes', validate(s.listSchemes), controller.listSchemes);
router.get('/schemes/:code', validate(s.resolveScheme), controller.resolveScheme);
router.post('/quote', validate(s.quote), controller.quote);

module.exports = router;
