// Golf Front Desk routes (mounted at /api/golf/front-desk behind
// requireMenuAction('/golf/tee-time-sheet') - the Tee Time Sheet menu, see
// golf.routes.js).
// Every route that reads a request part validates it at the boundary
// (platform/validate, schemas in frontdesk.schemas.js - the standing rule,
// mounted 2026-10-12); /meta reads nothing and stays bare.
const express = require('express');
const { validate } = require('../../platform/validate');

const router = express.Router();
const controller = require('./frontdesk.controller');
const s = require('./frontdesk.schemas');

router.get('/day', validate(s.day), controller.getDay);
router.get('/meta', controller.getMeta);
router.post('/registrations', validate(s.register), controller.register);
router.post('/register-flight', validate(s.registerFlight), controller.registerFlight);
// Group booking (2026-10-07): every still-booked player of a group on the date.
router.post('/register-group', validate(s.registerGroup), controller.registerGroup);
router.post('/registrations/:id/cancel', validate(s.cancelRegistration), controller.cancelRegistration);
router.get('/no-shows', validate(s.noShows), controller.getNoShows);
router.post('/no-shows', validate(s.confirmNoShows), controller.confirmNoShows);
router.post('/registrations/:id/bills', validate(s.openBill), controller.openBill);
router.get('/bills/:billId', validate(s.bill), controller.getBill);
router.post('/bills/:billId/items', validate(s.addItem), controller.addItem);
router.put('/bills/:billId/items/:itemId', validate(s.updateItem), controller.updateItem);
router.delete('/bills/:billId/items/:itemId', validate(s.item), controller.removeItem);
router.post('/bills/:billId/settle', validate(s.settle), controller.settleBill);
router.post('/bills/:billId/void', validate(s.voidBill), controller.voidBill);
// Rain checks (2026-10-15): issued from the flight workspace against a
// registered player's SETTLED bill; redeemed as a Rain Check-class tender at
// settle (the bill GET lists the golfer's open rain checks).
const rainChecks = require('./rainCheck.controller');
const rs = require('./rainCheck.schemas');
router.post('/registrations/:id/rain-check-preview', validate(rs.preview), rainChecks.preview);
router.post('/registrations/:id/rain-check', validate(rs.issue), rainChecks.issue);
// Affiliated visits (2026-10-15): the desk receives a confirmed visitor
// (letter of introduction and ID sighted) before their line can register.
const { z } = require('../../platform/validate');
router.post('/visits/:id/arrive', validate({ params: z.object({ id: z.string().uuid() }), body: z.object({ letterSighted: z.boolean().optional(), idSighted: z.boolean().optional() }) }), controller.receiveVisit);
// Named-caddy requests (2026-10-18): the desk keys a request on a booked or
// registered golfer (walk-ins included) and cancels it for the player.
const caddyRequests = require('./caddyRequest.controller');
const cs = require('./caddy.schemas');
router.get('/caddy-request-candidates', validate(cs.requestCandidates), caddyRequests.candidates);
router.post('/caddy-requests', validate(cs.requestForPlayer), caddyRequests.createForPlayer);
router.post('/caddy-requests/:requestId/cancel', validate(cs.requestCancel), caddyRequests.cancelByPlayer);

module.exports = router;
