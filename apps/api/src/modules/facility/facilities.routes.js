const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./facility.controller');
const s = require('./facility.schemas');

// In-memory upload (Cloud Run is stateless) for the unit picture, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/facility/facilities. The parent facility router applies
// verifyToken + requireModule('FACILITY') and the menu gate (reads pass on
// the Closures menu too, writes need the Facilities grant).
router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
// Multipart: the handler reads req.file only.
router.post('/picture', upload.single('picture'), controller.uploadPicture);
router.patch('/:id', validate(s.update), controller.update);
router.delete('/:id', validate(s.id), controller.remove);

module.exports = router;
