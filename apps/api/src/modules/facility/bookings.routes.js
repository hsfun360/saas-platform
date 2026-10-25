const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./booking.controller');
const s = require('./booking.schemas');

// Mounted at /api/facility/bookings behind requireMenuAction('/facility/bookings').
// The parent facility router already applies verifyToken + requireModule('FACILITY').
// Fixed paths before the :id ones.
router.get('/meta', controller.meta);
router.get('/context', validate(s.context), controller.context);
router.get('/availability', validate(s.availability), controller.availability);
router.get('/search', validate(s.search), controller.search);
router.post('/locks', validate(s.claimLocks), controller.claimLocks);
router.delete('/locks/:groupId', validate(s.releaseLock), controller.releaseLock);
router.get('/', validate(s.list), controller.list);
router.post('/', validate(s.create), controller.create);
router.get('/:id', validate(s.id), controller.get);
router.get('/:id/cancel-preview', validate(s.id), controller.cancelPreview);
router.post('/:id/cancel', validate(s.cancel), controller.cancel);
router.put('/:id/participants', validate(s.participants), controller.saveParticipants);

module.exports = router;
