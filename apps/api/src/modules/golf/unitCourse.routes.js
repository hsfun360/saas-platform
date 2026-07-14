const express = require('express');
const router = express.Router();
const controller = require('./unitCourse.controller');
const holeController = require('./unitCourseHole.controller');
const teeBoxController = require('./unitCourseTeeBox.controller');

// Mounted at /api/golf/unit-courses. The parent golf router already applies
// verifyToken (who) + requireModule('Golf Management') (entitled), so these
// handlers only deal with the active company's unit-course master file.
router.get('/meta', controller.getMeta);
router.get('/', controller.listUnitCourses);
router.post('/', controller.createUnitCourse);
router.patch('/:id', controller.updateUnitCourse);

// Hole Setup (spec 2.2.2) - child rows of a unit course; numbering is fixed by
// the course type, the user maintains par / stroke index / remarks.
router.get('/:id/holes', holeController.listHoles);
router.put('/:id/holes', holeController.saveHoles);

// Tee Box Setup (spec 2.2.3) - user-defined tee boxes per unit course, each
// with per-gender course/slope rating rows.
router.get('/:id/tee-boxes', teeBoxController.listTeeBoxes);
router.put('/:id/tee-boxes', teeBoxController.saveTeeBoxes);

module.exports = router;
