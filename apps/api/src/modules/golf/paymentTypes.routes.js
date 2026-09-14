// Payment Type master file. Mounted at /api/golf/payment-types
// behind verifyToken + requireModule + requireMenuAction('/golf/payment-types').

const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('./paymentType.controller');

// In-memory upload (Cloud Run is stateless) for the settlement-tile icon, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/icon', upload.single('icon'), controller.uploadIcon);
router.put('/:id', controller.update);
router.patch('/:id', controller.setActive);

module.exports = router;
