const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./closure.controller');
const s = require('./closure.schemas');

// Mounted at /api/golf/closures behind requireMenuAction('/golf/closures') -
// Course Closure is its OWN menu (2026-09-30) so maintenance schedulers can
// be granted closures without the Unit Course setup grant. The parent golf
// router already applies verifyToken (who) + requireModule('GOLF').
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.patch('/:planId', validate(s.update), controller.update);
router.post('/:planId/generate-days', validate(s.plan), controller.generateDays);
router.put('/:planId/days', validate(s.saveDays), controller.saveDays);

module.exports = router;
