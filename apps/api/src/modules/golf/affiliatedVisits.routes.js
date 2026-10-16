// Affiliated Visits routes (mounted at /api/golf/affiliated-visits behind
// requireMenuAction('/golf/affiliated-visits') - see golf.routes.js). Every
// route that reads a request part validates it at the boundary
// (platform/validate, schemas in affiliatedVisit.schemas.js); /meta reads
// nothing and the letter upload is multipart bounded by multer.
const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');

const router = express.Router();
const controller = require('./affiliatedVisit.controller');
const s = require('./affiliatedVisit.schemas');

// In-memory upload (Cloud Run is stateless) for the letter, 5 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/meta', controller.meta);
router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
router.post('/letter', upload.single('letter'), controller.uploadLetter);
router.get('/:id', validate(s.id), controller.get);
router.put('/:id', validate(s.update), controller.update);
router.get('/:id/confirm-preview', validate(s.id), controller.preview);
router.post('/:id/confirm', validate(s.id), controller.confirm);
router.post('/:id/decline', validate(s.reason), controller.decline);
router.post('/:id/cancel', validate(s.reason), controller.cancel);
router.post('/:id/arrive', validate(s.arrive), controller.arrive);
router.post('/:id/complete', validate(s.id), controller.complete);

module.exports = router;
