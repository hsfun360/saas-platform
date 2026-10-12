// Sales Agent master. Mounted at /api/membership/sales-agents behind
// verifyToken + requireModule + requireMenuAction('/membership/sales-agents').
const express = require('express');
const router = express.Router();
const controller = require('./salesAgent.controller');
const { validate } = require('../../platform/validate');
const s = require('./salesAgent.schemas');

router.get('/meta', validate(s.meta), controller.getMeta);
router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
router.post('/:id/invite', validate(s.invite), controller.invite);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id', validate(s.setActive), controller.setActive);

module.exports = router;
