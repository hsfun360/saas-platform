// src/modules/workflow/workflow.routes.js
//
// Workflow - shared approval-chain capability consumed by every product.
// Reserves the `/api/workflow` gateway seam.
//
// Designer endpoints are gated on the Workflow Setup menu (/admin/workflows).
// Inbox / act / history endpoints gate on a valid token only: a task is
// addressed to its assignee personally (enforced in the engine), and the
// history panel renders inside document screens that carry their own menu gate.

const express = require('express');
const router = express.Router();
const { verifyToken, requireMenuAction } = require('../../platform/serviceContext');
const controller = require('./workflow.controller');

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'workflow', status: 'ok' }));

// Everything below requires a valid token.
router.use(verifyToken);

// Designer (Workflow Setup screen).
router.get('/meta', requireMenuAction('/admin/workflows'), controller.getMeta);
router.get('/definitions', requireMenuAction('/admin/workflows'), controller.listDefinitions);
router.post('/definitions', requireMenuAction('/admin/workflows'), controller.createDefinition);
router.patch('/definitions/:id', requireMenuAction('/admin/workflows'), controller.updateDefinition);
router.get('/definitions/:id/preview', requireMenuAction('/admin/workflows'), controller.previewDefinition);

// My Approvals inbox + actions (assignee-personal; engine enforces ownership).
router.get('/my-tasks', controller.listMyTasks);
router.get('/my-tasks/count', controller.countMyTasks);
router.post('/tasks/:id/approve', controller.actOnTask('approved'));
router.post('/tasks/:id/reject', controller.actOnTask('rejected'));

// Per-document approval history + submitter recall.
router.get('/instances', controller.listEntityInstances);
router.post('/instances/:id/cancel', controller.cancelInstance);

module.exports = router;
