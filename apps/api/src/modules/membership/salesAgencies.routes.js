// Sales Agency master. Mounted at /api/membership/sales-agencies behind
// verifyToken + requireModule + requireMenuAction('/membership/sales-agencies').
const express = require('express');
const router = express.Router();
const controller = require('./salesAgency.controller');
const { validate } = require('../../platform/validate');
const s = require('./salesAgency.schemas');

router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id', validate(s.setActive), controller.setActive);

module.exports = router;
