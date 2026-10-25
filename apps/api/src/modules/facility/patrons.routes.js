const express = require('express');
const { z } = require('../../platform/validate');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./patron.controller');

const str = (max = 255) => z.string().max(max).nullable().optional();

// Mounted at /api/facility/patrons behind requireMenuAction('/facility/bookings').
router.get('/', validate({ query: z.object({ q: z.string().max(100) }) }), controller.search);
router.post('/', validate({ body: z.object({ name: z.string().max(255), identityNo: str(50), mobile: str(30), email: str(255) }) }), controller.createVisitor);

module.exports = router;
