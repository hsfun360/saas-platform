// Sales Agent master. Mounted at /api/membership/sales-agents behind
// verifyToken + requireModule + requireMenuAction('/membership/sales-agents').
const express = require('express');
const router = express.Router();
const controller = require('./salesAgent.controller');

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/invite', controller.invite);
router.put('/:id', controller.update);
router.patch('/:id', controller.setActive);

module.exports = router;
