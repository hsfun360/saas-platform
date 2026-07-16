const express = require('express');
const router = express.Router();
const controller = require('./membershipType.controller');

// Mounted at /api/membership/types. Auth + entitlement applied by the parent router.
router.get('/meta', controller.getMeta);
router.get('/currencies', controller.getCurrencies);
router.get('/', controller.listTypes);
router.post('/', controller.createType);
router.put('/:id', controller.updateType);
router.patch('/:id', controller.setActive);
// Child collections - maintained from their own dialogs on the listing.
router.put('/:id/additional-fees', controller.updateAdditionalFees);
router.put('/:id/standing-charges', controller.updateStandingCharges);

module.exports = router;
