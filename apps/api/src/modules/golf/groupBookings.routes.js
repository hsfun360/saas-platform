// Group / Tournament Booking routes (mounted at /api/golf/group-bookings
// behind requireMenuAction('/golf/group-bookings') - see golf.routes.js).
const express = require('express');

const router = express.Router();
const controller = require('./groupBooking.controller');

router.get('/meta', controller.getMeta);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.get);
router.put('/:id', controller.update);
router.post('/:id/cancel', controller.cancel);

router.post('/:id/days', controller.addDay);
router.put('/:id/days/:dayId', controller.updateDay);
router.delete('/:id/days/:dayId', controller.removeDay);
router.post('/:id/days/:dayId/flights/generate', controller.generateFlights);
router.delete('/:id/days/:dayId/flights/:flightId', controller.removeFlight);
router.put('/:id/days/:dayId/draw', controller.draw);

router.post('/:id/players', controller.addPlayers);
router.put('/:id/players/:playerId', controller.updatePlayer);
router.delete('/:id/players/:playerId', controller.removePlayer);

module.exports = router;
