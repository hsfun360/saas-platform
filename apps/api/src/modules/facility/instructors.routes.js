const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./instructor.controller');
const s = require('./instructor.schemas');

// In-memory upload (Cloud Run is stateless) for the instructor photo, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/facility/instructors. The parent facility router applies
// verifyToken + requireModule('FACILITY') and the menu gate (reads pass on
// the Classes and Class Schedule menus too, writes need the Instructors grant).
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
// Multipart: the handler reads req.file only.
router.post('/photo', upload.single('photo'), controller.uploadPhoto);
router.patch('/:id', validate(s.update), controller.update);
router.delete('/:id', validate(s.id), controller.remove);

module.exports = router;
