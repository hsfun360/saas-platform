// Business Insights - read-only analytics over the membership base, split
// across two screens (user decision 2026-07-22):
//   /membership/membership-analysis  - movement + demographics
//   /membership/agent-performance    - sales channel/agent performance
// The API base stays /api/membership/dashboard; RBAC is gated PER ENDPOINT to
// the owning screen's menu route. meta + drill serve both screens, so they
// pass with EITHER grant (requireAnyMenuAction). Everything is GET (the RBAC
// 'view' action) - the dashboard never mutates.

const express = require('express');
const router = express.Router();
const { requireMenuAction, requireAnyMenuAction } = require('../../platform/serviceContext');
const controller = require('./dashboard.controller');
// Query filters are validated at the boundary after the RBAC gate
// (platform/validate, schemas in dashboard.schemas.js - the standing rule).
const { validate } = require('../../platform/validate');
const s = require('./dashboard.schemas');

const ANALYSIS_MENU = '/membership/membership-analysis';
const AGENTS_MENU = '/membership/agent-performance';

const analysisOnly = requireMenuAction(ANALYSIS_MENU);
const agentsOnly = requireMenuAction(AGENTS_MENU);
const eitherScreen = requireAnyMenuAction([ANALYSIS_MENU, AGENTS_MENU]);

router.get('/meta', eitherScreen, controller.getMeta);
router.get('/summary', analysisOnly, validate(s.summary), controller.getSummary);
router.get('/movement', analysisOnly, validate(s.movement), controller.getMovement);
router.get('/breakdown', analysisOnly, validate(s.breakdown), controller.getBreakdown);
router.get('/agents', agentsOnly, validate(s.agents), controller.getAgentPerformance);
router.get('/drill', eitherScreen, validate(s.drill), controller.drill);

module.exports = router;
