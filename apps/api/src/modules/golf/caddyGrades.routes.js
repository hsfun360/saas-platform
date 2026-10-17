// Caddy Grade master file. Mounted at /api/golf/caddy-grades behind
// verifyToken + requireModule + requireMenuAction('/golf/caddy-grades').
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./caddyGrade.controller');
const s = require('./caddy.schemas');

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', validate(s.gradeCreate), controller.create);
router.put('/:id', validate(s.gradeUpdate), controller.update);
router.patch('/:id', validate(s.gradeSetActive), controller.setActive);
router.delete('/:id', validate(s.id), controller.remove);

module.exports = router;
