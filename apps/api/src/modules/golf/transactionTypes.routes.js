// Transaction Type master file. Mounted at /api/golf/transaction-types
// behind verifyToken + requireModule + requireMenuAction('/golf/transaction-types').

const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./transactionType.controller');
const rateController = require('./transactionTypeRate.controller');
const s = require('./transactionType.schemas');

// In-memory upload (Cloud Run is stateless) for the billing-item icon, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/meta', controller.getMeta);
router.get('/tax-schemes', controller.getTaxSchemes);
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
// The icon upload reads only req.file (multipart) - no request part to validate.
router.post('/icon', upload.single('icon'), controller.uploadIcon);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id', validate(s.setActive), controller.setActive);

// Pricing - effective-dated price cards of one transaction type.
router.get('/:id/rates', validate(s.rateList), rateController.list);
router.post('/:id/rates', validate(s.rateCreate), rateController.create);
router.put('/:id/rates/:rateId', validate(s.rateUpdate), rateController.update);
router.patch('/:id/rates/:rateId', validate(s.rateSetActive), rateController.setActive);
router.delete('/:id/rates/:rateId', validate(s.rateRemove), rateController.remove);

module.exports = router;
