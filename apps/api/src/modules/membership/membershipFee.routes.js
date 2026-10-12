const express = require('express');
const router = express.Router();
const controller = require('./membershipFee.controller');
// Request parts are validated at the boundary (platform/validate, schemas in
// membershipFee.schemas.js - the standing rule).
const { validate } = require('../../platform/validate');
const s = require('./membershipFee.schemas');

// Mounted at /api/membership/fees. Auth (verifyToken) + entitlement
// (requireModule('MEMBERSHIP')) are applied by the parent router.
router.get('/meta', controller.getMeta);
router.get('/tax-schemes', controller.getTaxSchemes);
router.get('/transaction-types', controller.getTransactionTypes);
router.get('/', controller.listFees);
router.post('/', validate(s.create), controller.createFee);
router.put('/:id', validate(s.update), controller.updateFee);
router.patch('/:id', validate(s.setActive), controller.setActive);

module.exports = router;
