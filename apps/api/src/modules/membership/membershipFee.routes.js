const express = require('express');
const router = express.Router();
const controller = require('./membershipFee.controller');

// Mounted at /api/membership/fees. Auth (verifyToken) + entitlement
// (requireModule('Membership Management')) are applied by the parent router.
router.get('/meta', controller.getMeta);
router.get('/tax-schemes', controller.getTaxSchemes);
router.get('/', controller.listFees);
router.post('/', controller.createFee);
router.put('/:id', controller.updateFee);
router.patch('/:id', controller.setActive);

module.exports = router;
