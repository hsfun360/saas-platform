// Rain Checks routes (mounted at /api/golf/rain-checks behind
// requireMenuAction('/golf/rain-checks') - see golf.routes.js). The issue
// doors live on the front-desk router (the Tee Time Sheet's menu).
// Every route validates its request parts at the boundary (platform/validate,
// schemas in rainCheck.schemas.js).
const express = require('express');
const { validate } = require('../../platform/validate');

const router = express.Router();
const controller = require('./rainCheck.controller');
const s = require('./rainCheck.schemas');

router.get('/', validate(s.list), controller.list);
router.get('/:id', validate(s.id), controller.get);
router.post('/:id/cancel', validate(s.cancel), controller.cancel);

module.exports = router;
