const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./station.controller');
const s = require('./station.schemas');

// Mounted at /api/facility/station behind requireMenuAction('/facility/station')
// - the desk's own menu, grantable without the setup screens. The parent
// facility router already applies verifyToken + requireModule('FACILITY').
router.get('/meta', controller.meta);
router.get('/today', validate(s.today), controller.today);
router.post('/check-ins', validate(s.checkIn), controller.checkIn);
router.post('/registrations', validate(s.register), controller.register);
router.post('/registrations/:id/sign-out', validate(s.id), controller.signOut);
router.put('/registrations/:id/guests', validate(s.guests), controller.saveGuests);
// Slice 6b: the desk starts from the person - a scanned guest pass or a keyed
// member number opens the Serve panel; a tile tap is POST /issues.
router.post('/scan', validate(s.scan), controller.scan);
router.post('/issues', validate(s.issue), controller.issue);
router.post('/issues/:id/undo', validate(s.id), controller.undoIssue);
router.post('/issues/:id/return', validate(s.returnIssue), controller.returnIssue);
// Slice 6c: the guest without a pass, with the member - registered at the
// counter (a pass from then on) or served by name; the pass handed over
// again; a guest added by mistake taken back.
router.post('/door-guests', validate(s.doorGuest), controller.addDoorGuest);
router.get('/door-guests/:id/pass', validate(s.id), controller.doorPass);
router.post('/door-guests/:id/send', validate(s.doorSend), controller.sendDoorPass);
router.post('/door-guests/:id/remove', validate(s.id), controller.removeDoorGuest);
// Slice 6d: one person enters an entry facility from the Serve panel (the
// member, or a guest onto the host's entry).
router.post('/admissions', validate(s.admit), controller.admit);
router.post('/units/:id/clear', validate(s.id), controller.clearUnit);
router.post('/end-of-day', validate(s.endOfDay), controller.endOfDay);
router.post('/no-shows', validate(s.markNoShows), controller.markNoShows);
// Slice 5b: a walk-in enrolment into one of today's class sessions.
router.post('/class-enrolments', validate(require('./class.schemas').enrol), controller.enrolWalkIn);

module.exports = router;
