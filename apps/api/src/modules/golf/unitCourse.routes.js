const express = require('express');
const router = express.Router();
const controller = require('./unitCourse.controller');
const holeController = require('./unitCourseHole.controller');
const teeBoxController = require('./unitCourseTeeBox.controller');
const closureController = require('./unitCourseClosure.controller');

// Mounted at /api/golf/unit-courses. The parent golf router already applies
// verifyToken (who) + requireModule('GOLF') (entitled), so these
// handlers only deal with the active company's unit-course master file.
router.get('/meta', controller.getMeta);
router.get('/', controller.listUnitCourses);
router.post('/', controller.createUnitCourse);
router.patch('/:id', controller.updateUnitCourse);
router.delete('/:id', controller.deleteUnitCourse);

// Hole Setup (spec 2.2.2) - child rows of a unit course; numbering is fixed by
// the course type, the user maintains par / stroke index / remarks.
router.get('/:id/holes', holeController.listHoles);
router.put('/:id/holes', holeController.saveHoles);

// Tee Box Setup (spec 2.2.3) - user-defined tee boxes per unit course, each
// with per-gender course/slope rating rows.
router.get('/:id/tee-boxes', teeBoxController.listTeeBoxes);
router.put('/:id/tee-boxes', teeBoxController.saveTeeBoxes);

// Closure plans (spec 2.2.8, re-keyed 2026-09-30) - a closure is a fact about
// the PHYSICAL NINE (composite rotation: closing EAST1 blocks E1 tee-offs AND
// W3 crossover landings), so plans live on the unit course. Rule header +
// generated per-day rows; generation classifies dates server-side (Company
// Weekend Days + Public Holidays via the calendar seam; holidays count as
// weekend) and returns a preview; the PUT saves the reviewed list atomically.
router.get('/:id/closure-plans', closureController.listPlans);
router.post('/:id/closure-plans', closureController.createPlan);
router.patch('/:id/closure-plans/:planId', closureController.updatePlan);
router.post('/:id/closure-plans/:planId/generate-days', closureController.generateDays);
router.put('/:id/closure-plans/:planId/days', closureController.saveDays);

module.exports = router;
