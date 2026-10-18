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
// Change booking (2026-10-14): preview states the outcome, apply re-judges
// it under the day lock; the history lists every amendment of the booking.
router.post('/:id/change-preview', validate(s.change), controller.changePreview);
router.post('/:id/change', validate(s.change), controller.change);
router.get('/:id/changes', validate(s.id), controller.listChanges);
// Named-caddy requests (2026-10-18): a player asks for a particular caddy on
// the booking; the candidates picker and the player's cancel live here too.
const caddyRequests = require('./caddyRequest.controller');
const cs = require('./caddy.schemas');
router.get('/caddy-request-candidates', validate(cs.requestCandidates), caddyRequests.candidates);
router.post('/:id/caddy-requests', validate(cs.requestForBooking), caddyRequests.createForBooking);
router.post('/caddy-requests/:requestId/cancel', validate(cs.requestCancel), caddyRequests.cancelByPlayer);

module.exports = router;
