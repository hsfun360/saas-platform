// Caddies - the caddy register with leave records and notes. Mounted at
// /api/golf/caddies behind verifyToken + requireModule +
// requireMenuAction('/golf/caddies').
const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./caddy.controller');
const s = require('./caddy.schemas');

// In-memory upload (Cloud Run is stateless) for the caddy photo, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/meta', controller.getMeta);
router.get('/badges/html', validate(s.badges), controller.badgesHtml);
router.post('/photo', upload.single('photo'), controller.uploadPhoto);
router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
router.put('/:id', validate(s.update), controller.update);
router.patch('/:id/status', validate(s.setStatus), controller.setStatus);
router.post('/:id/regenerate-qr', validate(s.id), controller.regenerateQr);
router.delete('/:id', validate(s.id), controller.remove);
router.get('/:id/leaves', validate(s.id), controller.listLeaves);
router.post('/:id/leaves', validate(s.leaveCreate), controller.createLeave);
router.put('/:id/leaves/:leaveId', validate(s.leaveUpdate), controller.updateLeave);
router.delete('/:id/leaves/:leaveId', validate(s.leaveId), controller.removeLeave);
router.get('/:id/notes', validate(s.id), controller.listNotes);
router.post('/:id/notes', validate(s.noteCreate), controller.createNote);
router.put('/:id/notes/:noteId', validate(s.noteUpdate), controller.updateNote);
router.delete('/:id/notes/:noteId', validate(s.noteId), controller.removeNote);

module.exports = router;
