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

module.exports = router;
