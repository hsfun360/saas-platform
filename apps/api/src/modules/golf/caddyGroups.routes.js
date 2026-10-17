// Caddy Group master file. Mounted at /api/golf/caddy-groups behind
// verifyToken + requireModule + requireMenuAction('/golf/caddy-groups').
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./caddyGroup.controller');
const s = require('./caddy.schemas');

router.get('/', controller.list);
router.post('/', validate(s.groupCreate), controller.create);
router.put('/:id', validate(s.groupUpdate), controller.update);
router.patch('/:id', validate(s.groupSetActive), controller.setActive);
router.delete('/:id', validate(s.id), controller.remove);

module.exports = router;
