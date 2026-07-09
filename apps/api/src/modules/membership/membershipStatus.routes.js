const express = require('express');
const router = express.Router();
const controller = require('./membershipStatus.controller');

// Mounted at /api/membership/statuses. The parent membership router already
// applies verifyToken (who) + requireModule('Membership Management') (entitled),
// so these handlers only deal with the active company's status master file.
router.get('/meta', controller.getMeta);
router.get('/copy-sources', controller.getCopySources);
router.post('/copy', controller.copyStatuses);
router.get('/', controller.listStatuses);
router.post('/', controller.createStatus);
router.patch('/:id', controller.updateStatus);

module.exports = router;
