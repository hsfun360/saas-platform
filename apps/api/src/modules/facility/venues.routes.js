const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./venue.controller');
const s = require('./venue.schemas');

// Mounted at /api/facility/venues. The parent facility router applies
// verifyToken + requireModule('FACILITY') and the menu gate (reads pass on
// the Classes and Class Schedule menus too, writes need the Venues grant).
router.get('/', controller.list);
router.post('/', validate(s.create), controller.create);
router.patch('/:id', validate(s.update), controller.update);
router.delete('/:id', validate(s.id), controller.remove);

module.exports = router;
