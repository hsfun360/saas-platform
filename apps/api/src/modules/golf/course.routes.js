const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('./course.controller');

// In-memory upload (Cloud Run is stateless) for the course picture, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/golf/courses. The parent golf router already applies
// verifyToken (who) + requireModule('Golf Management') (entitled), so these
// handlers only deal with the active company's course master file.
router.get('/', controller.listCourses);
router.post('/', controller.createCourse);
router.post('/photo', upload.single('photo'), controller.uploadPhoto);
router.patch('/:id', controller.updateCourse);

module.exports = router;
