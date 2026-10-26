const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./class.controller');
const schedules = require('./classSchedule.controller');
const s = require('./class.schemas');

// Mounted at /api/facility/classes. The parent facility router applies
// verifyToken + requireModule('FACILITY') and the menu gate (reads pass on
// the Class Schedule menu too, writes need the Classes grant).
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.patch('/:id', validate(s.update), controller.update);
router.delete('/:id', validate(s.id), controller.remove);

// The class's schedules: header, preview, generated sessions.
router.get('/:id/schedules', validate(s.scheduleList), schedules.list);
router.post('/:id/schedules/preview', validate(s.schedulePreview), schedules.preview);
router.post('/:id/schedules', validate(s.scheduleCreate), schedules.create);
router.put('/:id/schedules/:scheduleId', validate(s.scheduleUpdate), schedules.update);
router.post('/:id/schedules/:scheduleId/close', validate(s.scheduleClose), schedules.close);
router.post('/:id/schedules/:scheduleId/cancel', validate(s.scheduleCancel), schedules.cancel);

module.exports = router;
