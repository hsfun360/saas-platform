// Sales Agency master. Mounted at /api/membership/sales-agencies behind
// verifyToken + requireModule + requireMenuAction('/membership/sales-agencies').
const express = require('express');
const router = express.Router();
const controller = require('./salesAgency.controller');

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id', controller.setActive);

module.exports = router;
