const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./utilityItem.controller');
const s = require('./utilityItem.schemas');

// In-memory upload (Cloud Run is stateless) for the item icon, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/facility/utility-items (slice 6a). The parent facility
// router applies verifyToken + requireModule('FACILITY') and the menu gate:
// reads pass on the Control Station grant too, writes need the Utility Items
// grant.
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
// Multipart: the handler reads req.file only.
router.post('/icon', upload.single('icon'), controller.uploadIcon);
router.patch('/:id', validate(s.update), controller.update);
router.delete('/:id', validate(s.id), controller.remove);

// The numbered units of an item that tracks them.
router.get('/:id/units', validate(s.id), controller.listUnits);
router.post('/:id/units', validate(s.unitCreate), controller.createUnit);
router.post('/:id/units/generate', validate(s.generate), controller.generateUnits);
router.patch('/:id/units/:unitId', validate(s.unitUpdate), controller.updateUnit);
router.delete('/:id/units/:unitId', validate(s.unit), controller.removeUnit);

module.exports = router;
