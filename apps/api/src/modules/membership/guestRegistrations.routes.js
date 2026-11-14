// Registration Counter routes (mounted at /api/membership/guest-registrations
// behind the Registration Counter screen's menu grant - see
// membership.routes.js). Every route validates its request parts at the
// boundary (platform/validate, schemas in guestRegistration.schemas.js).
//
// The menu guard maps the HTTP method to the granted action, so the methods
// are chosen on purpose: a POST issues a NEW pass and needs the Create grant
// (register a member's guest, receive a visiting member for the day, record a
// walk-up, add a visitor's guest); every desk action on an existing
// registration is a PUT and needs the Edit grant (correct details, cancel,
// mark arrived, send the pass). PUT /scan sits with them: it only looks a pass
// up, but the scanned code holds the pass token, which belongs in a body
// rather than a query string.
const express = require('express');
const { validate } = require('../../platform/validate');

const router = express.Router();
const controller = require('./guestRegistration.controller');
const s = require('./guestRegistration.schemas');

router.get('/', validate(s.list), controller.list);
// The affiliated / reciprocal side of the counter (registrationCounter.service).
router.post('/visits/:id/receive', validate(s.receive), controller.receiveVisit);
router.post('/walk-ups', validate(s.walkUp), controller.walkUp);
router.get('/host', validate(s.host), controller.host);
router.get('/guests', validate(s.guests), controller.guests);
router.post('/', validate(s.create), controller.create);
router.put('/scan', validate(s.scan), controller.scan);
router.get('/:id', validate(s.id), controller.get);
router.put('/:id', validate(s.update), controller.update);
router.get('/:id/pass', validate(s.id), controller.pass);
router.put('/:id/cancel', validate(s.reason), controller.cancel);
router.put('/:id/arrive', validate(s.id), controller.arrive);
router.put('/:id/send', validate(s.send), controller.sendPass);
router.post('/:id/guests', validate(s.visitorGuest), controller.addVisitorGuest);

module.exports = router;
