// Members - flat read-only search across every person the company knows
// (individual members, nominees, dependents). Mounted at /api/membership/members
// behind verifyToken + requireModule + requireMenuAction('/membership/members').

const express = require('express');
const router = express.Router();
const controller = require('./member.controller');

router.get('/meta', controller.getMeta);
router.get('/', controller.listMembers);

module.exports = router;
