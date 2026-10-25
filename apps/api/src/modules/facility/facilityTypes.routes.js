const express = require('express');
const multer = require('multer');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./facilityType.controller');
const slotSets = require('./slotSet.controller');
const s = require('./facilityType.schemas');
const ss = require('./slotSet.schemas');

// In-memory upload (Cloud Run is stateless) for the type icon, 2 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Mounted at /api/facility/facility-types. The parent facility router applies
// verifyToken + requireModule('FACILITY') and the menu gate (reads pass on
// the Facilities and Closures menus too, writes need the Facility Types grant).
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
// Multipart: the handler reads req.file only, so there is no request part
// for validate() to bound here.
router.post('/icon', upload.single('icon'), controller.uploadIcon);
router.patch('/:id', validate(s.update), controller.update);
router.delete('/:id', validate(s.id), controller.remove);

// Slot sets of a slot-mode type: header + generated slots, previewed first.
router.get('/:id/slot-sets', validate(ss.type), slotSets.list);
router.post('/:id/slot-sets/preview', validate(ss.preview), slotSets.preview);
router.post('/:id/slot-sets', validate(ss.createSet), slotSets.create);
router.patch('/:id/slot-sets/:setId', validate(ss.updateSet), slotSets.update);
router.put('/:id/slot-sets/:setId/slots', validate(ss.saveSlots), slotSets.saveSlots);
router.delete('/:id/slot-sets/:setId', validate(ss.set), slotSets.remove);

module.exports = router;
