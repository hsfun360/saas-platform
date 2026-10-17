// Buggy Type master file. Mounted at /api/golf/buggy-types behind
// verifyToken + requireModule + requireMenuAction('/golf/buggy-types').
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./buggyType.controller');
const s = require('./buggyType.schemas');

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id', validate(s.setActive), controller.setActive);
router.delete('/:id', validate(s.remove), controller.remove);

module.exports = router;
