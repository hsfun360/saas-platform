const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./classSession.controller');
const s = require('./class.schemas');

// Mounted at /api/facility/class-sessions (the Class Schedule timetable).
// The parent facility router applies verifyToken + requireModule('FACILITY')
// and the menu gate (reads pass on the Classes menu too, writes need the
// Class Schedule grant).
router.get('/', validate(s.sessionList), controller.list);
router.post('/', validate(s.sessionCreate), controller.create);
router.patch('/:id', validate(s.sessionUpdate), controller.update);
router.post('/:id/cancel', validate(s.sessionCancel), controller.cancel);

module.exports = router;
