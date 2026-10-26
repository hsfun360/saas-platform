const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./classSession.controller');
const enrolments = require('./classEnrolment.controller');
const s = require('./class.schemas');

// Mounted at /api/facility/class-sessions (the Class Schedule timetable).
// The parent facility router applies verifyToken + requireModule('FACILITY')
// and the menu gate (reads pass on the Classes menu too, writes need the
// Class Schedule grant).
router.get('/', validate(s.sessionList), controller.list);
router.post('/', validate(s.sessionCreate), controller.create);
router.patch('/:id', validate(s.sessionUpdate), controller.update);
router.post('/:id/cancel', validate(s.sessionCancel), controller.cancel);

// Slice 5b: the roster, the attendance marks and the Hold.
router.get('/:id/roster', validate(s.roster), enrolments.roster);
router.put('/:id/attendance', validate(s.attendance), enrolments.markAttendance);
router.post('/:id/hold', validate(s.hold), enrolments.hold);

module.exports = router;
