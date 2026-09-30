const express = require('express');
const router = express.Router();
const controller = require('./closure.controller');

// Mounted at /api/golf/closures behind requireMenuAction('/golf/closures') -
// Course Closure is its OWN menu (2026-09-30) so maintenance schedulers can
// be granted closures without the Unit Course setup grant. The parent golf
// router already applies verifyToken (who) + requireModule('GOLF').
router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:planId', controller.update);
router.post('/:planId/generate-days', controller.generateDays);
router.put('/:planId/days', controller.saveDays);

module.exports = router;
