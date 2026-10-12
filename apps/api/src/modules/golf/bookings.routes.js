// Golf Booking routes (mounted at /api/golf/bookings behind
// requireMenuAction('/golf/bookings') - see golf.routes.js).
// Every route validates its request parts at the boundary (platform/validate,
// schemas in booking.schemas.js - the standing rule, mounted 2026-10-12).
const express = require('express');
const { validate } = require('../../platform/validate');

const router = express.Router();
const controller = require('./booking.controller');
const s = require('./booking.schemas');

router.get('/context', validate(s.context), controller.getContext);
router.post('/availability', validate(s.availability), controller.searchAvailability);
router.post('/locks', validate(s.lock), controller.createLock);
router.delete('/locks/:groupId', validate(s.releaseLock), controller.releaseLock);
router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
router.get('/:id/cancel-preview', validate(s.id), controller.cancelPreview);
router.post('/:id/cancel', validate(s.cancel), controller.cancel);

module.exports = router;
