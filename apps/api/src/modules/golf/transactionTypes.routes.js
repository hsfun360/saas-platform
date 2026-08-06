// Transaction Type master file. Mounted at /api/golf/transaction-types
// behind verifyToken + requireModule + requireMenuAction('/golf/transaction-types').

const express = require('express');
const router = express.Router();
const controller = require('./transactionType.controller');
const rateController = require('./transactionTypeRate.controller');

router.get('/meta', controller.getMeta);
router.get('/tax-schemes', controller.getTaxSchemes);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id', controller.setActive);

// Pricing - effective-dated price cards of one transaction type.
router.get('/:id/rates', rateController.list);
router.post('/:id/rates', rateController.create);
router.put('/:id/rates/:rateId', rateController.update);
router.patch('/:id/rates/:rateId', rateController.setActive);
router.delete('/:id/rates/:rateId', rateController.remove);

module.exports = router;
