// Buggy Station routes. Mounted at /api/golf/buggy-station behind
// verifyToken + requireModule + requireMenuAction('/golf/buggy-station') - a
// Front Desk screen with its own grant (the starter hut needs neither the
// tee-sheet nor the fleet-register grants).
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./buggyStation.controller');
const s = require('./buggy.schemas');

router.get('/day', validate(s.day), controller.day);
router.get('/available', controller.available);
router.get('/resolve', validate(s.resolve), controller.resolve);
router.post('/issue', validate(s.issue), controller.issue);
router.post('/return', validate(s.return), controller.returnBuggy);
router.post('/swap', validate(s.swap), controller.swap);

module.exports = router;
