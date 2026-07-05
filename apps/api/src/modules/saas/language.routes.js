const express = require('express');
const router = express.Router();

const { verifyToken } = require('../../platform/auth.middleware');
const languageController = require('./language.controller');

// Read-only language list for the app's pickers. Any authenticated user, so this
// is guarded by verifyToken only - NOT the System Admin RBAC that gates
// /api/admin/languages maintenance.
router.use(verifyToken);
router.get('/', languageController.listActiveLanguages);

module.exports = router;
