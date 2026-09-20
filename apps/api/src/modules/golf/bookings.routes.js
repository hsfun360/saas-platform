// Golf Booking routes (mounted at /api/golf/bookings behind
// requireMenuAction('/golf/bookings') - see golf.routes.js).
const express = require('express');

const router = express.Router();
const controller = require('./booking.controller');

router.get('/context', controller.getContext);
router.post('/availability', controller.searchAvailability);
router.post('/locks', controller.createLock);
router.delete('/locks/:groupId', controller.releaseLock);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/cancel', controller.cancel);

module.exports = router;
