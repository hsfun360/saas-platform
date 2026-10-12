const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./course.controller');
const teeTimeController = require('./courseTeeTime.controller');
const { DAY_SCOPES } = require('./courseTeeTime.constants');
const s = require('./course.schemas');
const ts = require('./courseTeeTime.schemas');

// In-memory upload (Cloud Run is stateless) for the course picture, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/golf/courses. The parent golf router already applies
// verifyToken (who) + requireModule('GOLF') (entitled), so these
// handlers only deal with the active company's course master file.
router.get('/meta', (req, res) => res.status(200).json({ dayScopes: DAY_SCOPES }));
router.get('/', controller.listCourses);
router.post('/', validate(s.create), controller.createCourse);
// Multipart: the handler reads req.file only (no params, query or text
// fields), so there is no request part for validate() to bound here.
router.post('/photo', upload.single('photo'), controller.uploadPhoto);
router.patch('/:id', validate(s.update), controller.updateCourse);
router.delete('/:id', validate(s.id), controller.deleteCourse);

// Tee-time sets (spec 2.2.5/2.2.6 collapsed) - each course owns its own
// tee-off/flight time setups, versioned by day scope + effective date.
router.get('/:id/tee-time-sets', validate(ts.course), teeTimeController.listSets);
router.post('/:id/tee-time-sets', validate(ts.createSet), teeTimeController.createSet);
router.patch('/:id/tee-time-sets/:setId', validate(ts.updateSet), teeTimeController.updateSet);
router.put('/:id/tee-time-sets/:setId/slots', validate(ts.saveSlots), teeTimeController.saveSlots);

// Closure plans moved to /api/golf/unit-courses/:id/closure-plans (2026-09-30):
// a closure is a fact about the physical nine, not the 18-hole course.

module.exports = router;
