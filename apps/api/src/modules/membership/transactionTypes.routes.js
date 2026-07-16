// Transaction Type master file. Mounted at /api/membership/transaction-types
// behind verifyToken + requireModule + requireMenuAction('/membership/transaction-types').

const express = require('express');
const router = express.Router();
const controller = require('./transactionType.controller');

router.get('/meta', controller.getMeta);
router.get('/tax-schemes', controller.getTaxSchemes);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id', controller.setActive);

module.exports = router;
