const express = require('express');
const router = express.Router();
const controller = require('./membershipType.controller');
// Request parts are validated at the boundary (platform/validate, schemas in
// membershipType.schemas.js - the standing rule).
const { validate } = require('../../platform/validate');
const s = require('./membershipType.schemas');

// Mounted at /api/membership/types. Auth + entitlement applied by the parent router.
router.get('/meta', controller.getMeta);
router.get('/currencies', controller.getCurrencies);
router.get('/transaction-types', controller.getTransactionTypes);
router.get('/', controller.listTypes);
router.post('/', validate(s.create), controller.createType);
router.put('/:id', validate(s.update), controller.updateType);
router.patch('/:id', validate(s.setActive), controller.setActive);
// Child collections - maintained from their own dialogs on the listing.
router.put('/:id/additional-fees', validate(s.additionalFees), controller.updateAdditionalFees);
router.put('/:id/standing-charges', validate(s.standingCharges), controller.updateStandingCharges);

module.exports = router;
