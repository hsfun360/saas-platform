// No-show Charges routes (mounted at /api/golf/no-show-charges behind
// requireMenuAction('/golf/no-show-charges') - see golf.routes.js).
const express = require('express');

const router = express.Router();
const controller = require('./noShowCharge.controller');

router.get('/', controller.list);
router.post('/:id/post', controller.post);
router.post('/:id/waive', controller.waive);

module.exports = router;
