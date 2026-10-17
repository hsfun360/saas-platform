// Caddy Station routes. Mounted at /api/golf/caddy-station behind
// verifyToken + requireModule + requireMenuAction('/golf/caddy-station') - a
// Front Desk screen with its own grant, like the Buggy Station.
const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./caddyStation.controller');
const s = require('./caddy.schemas');

router.get('/day', validate(s.stationDay), controller.day);
router.get('/resolve', validate(s.stationResolve), controller.resolve);
router.post('/check-in', validate(s.stationCheckIn), controller.checkIn);
router.post('/check-out', validate(s.stationCheckOut), controller.checkOut);
router.post('/assign', validate(s.stationAssign), controller.assign);
router.post('/complete', validate(s.stationComplete), controller.complete);
router.post('/swap', validate(s.stationSwap), controller.swap);

module.exports = router;
