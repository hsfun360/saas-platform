// Membership Dashboard - read-only analytics over the membership base.
// Mounted at /api/membership/dashboard behind verifyToken + requireModule +
// requireMenuAction('/membership/dashboard') (see membership.routes.js).
// Everything is GET (the RBAC 'view' action) - the dashboard never mutates.

const express = require('express');
const router = express.Router();
const controller = require('./dashboard.controller');

router.get('/meta', controller.getMeta);
router.get('/summary', controller.getSummary);
router.get('/movement', controller.getMovement);
router.get('/breakdown', controller.getBreakdown);
router.get('/agents', controller.getAgentPerformance);
router.get('/drill', controller.drill);

module.exports = router;
