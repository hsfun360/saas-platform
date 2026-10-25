// Payment Type master. Mounted at /api/facility/payment-types behind
// verifyToken + requireModule + requireMenuAction('/facility/payment-types').
const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./paymentType.controller');
const s = require('./paymentType.schemas');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
// The icon upload reads only req.file (multipart) - no request part to validate.
router.post('/icon', upload.single('icon'), controller.uploadIcon);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id', validate(s.setActive), controller.setActive);

module.exports = router;
