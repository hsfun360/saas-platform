// No-show Charges routes (mounted at /api/golf/no-show-charges behind
// requireMenuAction('/golf/no-show-charges') - see golf.routes.js).
// Every route validates its request parts at the boundary (platform/validate,
// schemas in noShowCharge.schemas.js - the standing rule, mounted 2026-10-12).
const express = require('express');
const { validate } = require('../../platform/validate');

const router = express.Router();
const controller = require('./noShowCharge.controller');
const s = require('./noShowCharge.schemas');

router.get('/', validate(s.list), controller.list);
router.post('/:id/post', validate(s.id), controller.post);
router.post('/:id/waive', validate(s.waive), controller.waive);

module.exports = router;
