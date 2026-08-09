// Transaction Type master file. Mounted at /api/golf/transaction-types
// behind verifyToken + requireModule + requireMenuAction('/golf/transaction-types').

const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('./transactionType.controller');
const rateController = require('./transactionTypeRate.controller');

// In-memory upload (Cloud Run is stateless) for the billing-item icon, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/meta', controller.getMeta);
router.get('/tax-schemes', controller.getTaxSchemes);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/icon', upload.single('icon'), controller.uploadIcon);
router.put('/:id', controller.update);
router.patch('/:id', controller.setActive);

// Pricing - effective-dated price cards of one transaction type.
router.get('/:id/rates', rateController.list);
router.post('/:id/rates', rateController.create);
router.put('/:id/rates/:rateId', rateController.update);
router.patch('/:id/rates/:rateId', rateController.setActive);
router.delete('/:id/rates/:rateId', rateController.remove);

module.exports = router;
