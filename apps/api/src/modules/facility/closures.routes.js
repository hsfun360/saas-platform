const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./closure.controller');
const s = require('./closure.schemas');

// Mounted at /api/facility/closure-plans behind requireMenuAction('/facility/closures')
// - Facility Closures is its OWN menu so maintenance schedulers can be
// granted closures without the Facilities setup grant. The parent facility
// router already applies verifyToken + requireModule('FACILITY').
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.patch('/:planId', validate(s.update), controller.update);
router.delete('/:planId', validate(s.plan), controller.remove);
router.post('/:planId/generate-days', validate(s.plan), controller.generateDays);
router.put('/:planId/days', validate(s.saveDays), controller.saveDays);

module.exports = router;
