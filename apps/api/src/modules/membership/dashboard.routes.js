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

const ANALYSIS_MENU = '/membership/membership-analysis';
const AGENTS_MENU = '/membership/agent-performance';

const analysisOnly = requireMenuAction(ANALYSIS_MENU);
const agentsOnly = requireMenuAction(AGENTS_MENU);
const eitherScreen = requireAnyMenuAction([ANALYSIS_MENU, AGENTS_MENU]);

router.get('/meta', eitherScreen, controller.getMeta);
router.get('/summary', analysisOnly, controller.getSummary);
router.get('/movement', analysisOnly, controller.getMovement);
router.get('/breakdown', analysisOnly, controller.getBreakdown);
router.get('/agents', agentsOnly, controller.getAgentPerformance);
router.get('/drill', eitherScreen, controller.drill);

module.exports = router;
