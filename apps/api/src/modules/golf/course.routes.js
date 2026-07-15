const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('./course.controller');
const teeTimeController = require('./courseTeeTime.controller');
const { DAY_SCOPES } = require('./courseTeeTime.constants');

// In-memory upload (Cloud Run is stateless) for the course picture, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/golf/courses. The parent golf router already applies
// verifyToken (who) + requireModule('Golf Management') (entitled), so these
// handlers only deal with the active company's course master file.
router.get('/meta', (req, res) => res.status(200).json({ dayScopes: DAY_SCOPES }));
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

module.exports = router;
