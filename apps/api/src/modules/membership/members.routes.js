// Members - flat read-only search across every person the company knows
// (individual members, nominees, dependents). Mounted at /api/membership/members
// behind verifyToken + requireModule + requireMenuAction('/membership/members').

const express = require('express');
const router = express.Router();
const controller = require('./member.controller');
// The search query is validated at the boundary (platform/validate, schemas
// in member.schemas.js - the standing rule).
const { validate } = require('../../platform/validate');
const s = require('./member.schemas');

router.get('/meta', controller.getMeta);
router.get('/', validate(s.list), controller.listMembers);

module.exports = router;
