const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('./course.controller');
const teeTimeController = require('./courseTeeTime.controller');
const closureController = require('./courseClosure.controller');
const { DAY_SCOPES } = require('./courseTeeTime.constants');
const { NINE_SCOPES } = require('./courseClosure.constants');

// In-memory upload (Cloud Run is stateless) for the course picture, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/golf/courses. The parent golf router already applies
// verifyToken (who) + requireModule('Golf Management') (entitled), so these
// handlers only deal with the active company's course master file.
router.get('/meta', (req, res) => res.status(200).json({ dayScopes: DAY_SCOPES, nineScopes: NINE_SCOPES }));
router.get('/', controller.listCourses);
router.post('/', controller.createCourse);
router.post('/photo', upload.single('photo'), controller.uploadPhoto);
router.patch('/:id', controller.updateCourse);

// Tee-time sets (spec 2.2.5/2.2.6 collapsed) - each course owns its own
// tee-off/flight time setups, versioned by day scope + effective date.
router.get('/:id/tee-time-sets', teeTimeController.listSets);
router.post('/:id/tee-time-sets', teeTimeController.createSet);
router.patch('/:id/tee-time-sets/:setId', teeTimeController.updateSet);
router.put('/:id/tee-time-sets/:setId/slots', teeTimeController.saveSlots);

// Closure plans (spec 2.2.8) - rule header + generated per-day rows. Generation
// classifies dates server-side (Company Weekend Days + Public Holidays via the
// calendar seam; holidays count as weekend) and returns a preview; the PUT
// saves the reviewed day list atomically.
router.get('/:id/closure-plans', closureController.listPlans);
router.post('/:id/closure-plans', closureController.createPlan);
router.patch('/:id/closure-plans/:planId', closureController.updatePlan);
router.post('/:id/closure-plans/:planId/generate-days', closureController.generateDays);
router.put('/:id/closure-plans/:planId/days', closureController.saveDays);

module.exports = router;
