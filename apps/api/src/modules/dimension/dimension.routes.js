// src/modules/dimension/dimension.routes.js
//
// Dimension - the shared financial-analysis capability (promoted 2026-08-25,
// same tier as Tax). Reserves the `/api/dimension` gateway seam. Consumers
// (AR today; AP / GL / PO later) read entry meta and validate selections
// through platform/dimensionGateway.js, never these setup routes.
//
// The Setup screen currently lives under the AR menu tree ('/ar/analysis'),
// so every route gates on that menu; when a second consumer arrives the menu
// (and this gate) relocates to a common area - a one-line change here.

const express = require('express');
const router = express.Router();
const { verifyToken, requireMenuAction } = require('../../platform/serviceContext');
const controller = require('./dimension.controller');

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'dimension', status: 'ok' }));

router.use(verifyToken);

router.get('/', requireMenuAction('/ar/analysis'), controller.list);
router.post('/categories', requireMenuAction('/ar/analysis'), controller.validateCategoryCreate, controller.createCategory);
router.put('/categories/:id', requireMenuAction('/ar/analysis'), controller.validateCategoryUpdate, controller.updateCategory);
router.patch('/categories/:id', requireMenuAction('/ar/analysis'), controller.validateSetActive, controller.setCategoryActive);
router.post('/options', requireMenuAction('/ar/analysis'), controller.validateOptionCreate, controller.createOption);
router.put('/options/:id', requireMenuAction('/ar/analysis'), controller.validateOptionUpdate, controller.updateOption);
router.patch('/options/:id', requireMenuAction('/ar/analysis'), controller.validateSetActive, controller.setOptionActive);

module.exports = router;
