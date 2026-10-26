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
router.post('/issues', validate(s.issue), controller.issue);
router.post('/issues/:id/return', validate(s.returnIssue), controller.returnIssue);
router.post('/units/:id/clear', validate(s.id), controller.clearUnit);
router.post('/end-of-day', validate(s.endOfDay), controller.endOfDay);
router.post('/no-shows', validate(s.markNoShows), controller.markNoShows);

module.exports = router;
