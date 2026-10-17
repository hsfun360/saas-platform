// Buggies - the fleet register. Mounted at /api/golf/buggies behind
// verifyToken + requireModule + requireMenuAction('/golf/buggies').
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./buggy.controller');
const s = require('./buggy.schemas');

router.get('/meta', controller.getMeta);
router.get('/labels/html', validate(s.labels), controller.labelsHtml);
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.get('/:id/history', validate(s.id), controller.history);
router.put('/:id', validate(s.update), controller.update);
router.post('/:id/retire', validate(s.retire), controller.retire);
router.post('/:id/reinstate', validate(s.id), controller.reinstate);
router.post('/:id/regenerate-qr', validate(s.id), controller.regenerateQr);
router.delete('/:id', validate(s.id), controller.remove);

module.exports = router;
