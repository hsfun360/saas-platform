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
const { validate } = require('../../platform/validate');
// Every route that reads a request part validates it at the boundary
// (platform/validate, schemas in workflow.schemas.js - mounted 2026-10-12).
const s = require('./workflow.schemas');

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'workflow', status: 'ok' }));

// Everything below requires a valid token.
router.use(verifyToken);

// Designer (Workflow Setup screen).
router.get('/meta', requireMenuAction('/admin/workflows'), controller.getMeta);
router.get('/definitions', requireMenuAction('/admin/workflows'), controller.listDefinitions);
router.post('/definitions', requireMenuAction('/admin/workflows'), validate(s.createDefinition), controller.createDefinition);
router.patch('/definitions/:id', requireMenuAction('/admin/workflows'), validate(s.updateDefinition), controller.updateDefinition);
router.get('/definitions/:id/preview', requireMenuAction('/admin/workflows'), validate(s.id), controller.previewDefinition);

// My Approvals inbox + actions (assignee-personal; engine enforces ownership).
router.get('/my-tasks', controller.listMyTasks);
router.get('/my-tasks/count', controller.countMyTasks);
router.post('/tasks/:id/approve', validate(s.act), controller.actOnTask('approved'));
router.post('/tasks/:id/reject', validate(s.act), controller.actOnTask('rejected'));

// Per-document approval history + submitter recall.
router.get('/instances', validate(s.entityInstances), controller.listEntityInstances);
router.post('/instances/:id/cancel', validate(s.id), controller.cancelInstance);

module.exports = router;
