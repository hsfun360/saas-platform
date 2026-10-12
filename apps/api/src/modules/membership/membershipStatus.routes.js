const express = require('express');
const router = express.Router();
const controller = require('./membershipStatus.controller');
// Request parts are validated at the boundary (platform/validate, schemas in
// membershipStatus.schemas.js - the standing rule).
const { validate } = require('../../platform/validate');
const s = require('./membershipStatus.schemas');

// Mounted at /api/membership/statuses. The parent membership router already
// applies verifyToken (who) + requireModule('MEMBERSHIP') (entitled),
// so these handlers only deal with the active company's status master file.
router.get('/meta', controller.getMeta);
router.get('/copy-sources', controller.getCopySources);
router.post('/copy', validate(s.copy), controller.copyStatuses);
router.get('/', controller.listStatuses);
router.post('/', validate(s.create), controller.createStatus);
router.patch('/:id', validate(s.update), controller.updateStatus);

module.exports = router;
